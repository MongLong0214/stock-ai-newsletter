import type { DatasetManifest } from './dataset-manifest'
import {
  fitScientificBaselines,
  predictBAblStrataBaseline,
  predictClimatologyBaseline,
  predictPersistenceBaseline,
  type BAblStratum,
  type ClimatologyBaselineArtifact,
  type PersistenceStratum,
  type ScientificBaselinePredictRow,
  type ScientificBaselineTrainRow,
  type StrataBaselineArtifact,
} from '../../../lib/tli/model/baselines'
import {
  computeSplitOriginsSha256,
  createStudyWalkForwardFolds,
  distinctOriginDates,
} from '../../../lib/tli/eval/walk-forward'
import type { EvalPredictionRow, StudyEvalRow, StudyOrigin } from '../../../lib/tli/eval/types'
import {
  fitTwoFeatureLogistic,
  type TwoFeatureLogisticArtifact,
  type TwoFeatureLogisticSkipReason,
  type TwoFeatureLogisticTrainRow,
} from '../../../lib/tli/model/two-feature-logistic'
import { computeStudyOriginScheduleSha256, type ScientificBaselineStudyLock } from './offline-eval-study-lock'

export const TWO_FEATURE_LOGISTIC_NAMES = ['interest_slope_7d', 'news_momentum'] as const

export interface ScientificBaselineEvalRow extends StudyEvalRow {
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly bablPhase: string | null
  readonly interestReturn10d: number | null
  readonly interestSlope7d: number | null
  readonly newsMomentum: number | null
  readonly y: boolean
}

export interface ScientificBaselineInput {
  readonly datasetManifest: Pick<DatasetManifest, 'study_contract_id' | 'study_contract_sha256'>
  readonly origins: readonly StudyOrigin[]
  readonly rows: readonly ScientificBaselineEvalRow[]
}

export interface BaselineArtifactPredictions<A> {
  readonly artifact: A
  readonly predictions: readonly EvalPredictionRow[]
}

interface TwoFeatureLogisticIdentity {
  readonly baselineId: 'logistic-two-feature-v1'
  readonly role: 'secondary_diagnostic'
  readonly featureNames: typeof TWO_FEATURE_LOGISTIC_NAMES
  readonly preprocessingContract: 'same-fold-train-only-median-mad-v1'
  readonly cSelectionContract: 'same-inner-oof-precalibration-brier-v1'
  readonly calibrationContract: 'same-time-blocked-oof-platt-v1'
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly splitOriginsSha256: string
  readonly trainOrigins: readonly string[]
  readonly testOrigin: string | null
}

/**
 * Diagnostic-only 2-feature logistic secondary. It is never placed on the promotion gate: the gate
 * schema (`offline-eval-baseline-gate.ts`) only reads `primary` artifacts, so this result stays out
 * of the frozen gate input entirely. It degrades to `not_computed` (with a reason) when a fold
 * cannot honour the same inner-OOF / class-floor contract the confirmatory candidate requires.
 */
export type TwoFeatureLogisticSecondary =
  | (TwoFeatureLogisticIdentity & {
    readonly status: 'computed'
    readonly artifact: TwoFeatureLogisticArtifact
    readonly predictions: readonly EvalPredictionRow[]
  })
  | (TwoFeatureLogisticIdentity & {
    readonly status: 'not_computed'
    readonly reason: TwoFeatureLogisticSkipReason
  })

export interface ScientificBaselineArtifactBundle {
  readonly scope: 'outer_fold' | 'prospective_cycle'
  readonly foldId: string | null
  readonly splitOriginsSha256: string
  readonly trainOrigins: readonly string[]
  readonly trainOriginRowCounts: Readonly<Record<string, number>>
  readonly testOrigin: string | null
  readonly primary: BaselineArtifactPredictions<StrataBaselineArtifact<BAblStratum>>
  readonly secondaryDiagnostics: {
    readonly climatology: BaselineArtifactPredictions<ClimatologyBaselineArtifact | null>
    readonly persistence: BaselineArtifactPredictions<StrataBaselineArtifact<PersistenceStratum>>
    readonly twoFeatureLogistic: TwoFeatureLogisticSecondary
  }
}

export interface ScientificBaselineEvaluation {
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly studyOriginScheduleSha256: string
  readonly studyOriginSchedule: readonly StudyOrigin[]
  readonly studyOrigins: readonly string[]
  readonly walkForwardSplitSha256: string
  readonly outerFolds: readonly ScientificBaselineArtifactBundle[]
  readonly prospectiveCycle: ScientificBaselineArtifactBundle
  readonly primaryPredictions: readonly EvalPredictionRow[]
}

type StudyIdentity = Pick<ScientificBaselineEvaluation, 'studyContractId' | 'studyContractSha256'>

const resolveStudyIdentity = (manifest: ScientificBaselineInput['datasetManifest']): StudyIdentity => {
  if (manifest.study_contract_id.length === 0) throw new Error('scientific baseline input requires dataset study_contract_id')
  if (!/^[0-9a-f]{64}$/.test(manifest.study_contract_sha256)) throw new Error('scientific baseline input requires a lowercase 64-hex study_contract_sha256')
  return {
    studyContractId: manifest.study_contract_id,
    studyContractSha256: manifest.study_contract_sha256,
  }
}

const toTrainRows = (rows: readonly ScientificBaselineEvalRow[]): ScientificBaselineTrainRow[] => rows.map((row) => ({
  themeId: row.themeId,
  originDate: row.baseDate,
  studyContractId: row.studyContractId,
  studyContractSha256: row.studyContractSha256,
  bablPhase: row.bablPhase,
  interestReturn10d: row.interestReturn10d,
  y: row.y,
}))

const assertRowsMatchStudy = (
  rows: readonly ScientificBaselineEvalRow[],
  study: StudyIdentity,
): void => {
  for (const row of rows) {
    if (
      row.studyContractId !== study.studyContractId
      || row.studyContractSha256 !== study.studyContractSha256
    ) {
      throw new Error(`scientific baseline input contains mixed-study row "${row.id}"`)
    }
  }
}

const toPredictRow = (row: ScientificBaselineEvalRow): ScientificBaselinePredictRow => ({
  id: `${row.themeId}|${row.baseDate}`,
  themeId: row.themeId,
  originDate: row.baseDate,
  bablPhase: row.bablPhase,
  interestReturn10d: row.interestReturn10d,
})

const toEvalPrediction = (input: {
  readonly row: ScientificBaselineEvalRow
  readonly probability: number
}): EvalPredictionRow => ({
  id: `${input.row.themeId}|${input.row.baseDate}`,
  themeId: input.row.themeId,
  baseDate: input.row.baseDate,
  probability: input.probability,
  y: input.row.y,
})

const toLogisticTrainRow = (row: ScientificBaselineEvalRow): TwoFeatureLogisticTrainRow => ({
  themeId: row.themeId,
  originDate: row.baseDate,
  interestSlope7d: row.interestSlope7d,
  newsMomentum: row.newsMomentum,
  y: row.y,
})

const twoFeatureSecondary = (input: {
  readonly study: StudyIdentity
  readonly splitOriginsSha256: string
  readonly trainRows: readonly ScientificBaselineEvalRow[]
  readonly testRows: readonly ScientificBaselineEvalRow[]
  readonly trainOrigins: readonly string[]
  readonly testOrigin: string | null
}): TwoFeatureLogisticSecondary => {
  const identity: TwoFeatureLogisticIdentity = {
    baselineId: 'logistic-two-feature-v1',
    role: 'secondary_diagnostic',
    featureNames: TWO_FEATURE_LOGISTIC_NAMES,
    preprocessingContract: 'same-fold-train-only-median-mad-v1',
    cSelectionContract: 'same-inner-oof-precalibration-brier-v1',
    calibrationContract: 'same-time-blocked-oof-platt-v1',
    studyContractId: input.study.studyContractId,
    studyContractSha256: input.study.studyContractSha256,
    splitOriginsSha256: input.splitOriginsSha256,
    trainOrigins: input.trainOrigins,
    testOrigin: input.testOrigin,
  }
  const fit = fitTwoFeatureLogistic({
    trainRows: input.trainRows.map(toLogisticTrainRow),
    studyContractId: input.study.studyContractId,
    studyContractSha256: input.study.studyContractSha256,
  })
  if (fit.status === 'not_computed') return { ...identity, status: 'not_computed', reason: fit.reason }
  const predictions = input.testRows.map((row) => toEvalPrediction({
    row,
    probability: fit.predict({
      id: `${row.themeId}|${row.baseDate}`,
      themeId: row.themeId,
      originDate: row.baseDate,
      interestSlope7d: row.interestSlope7d,
      newsMomentum: row.newsMomentum,
    }),
  }))
  return { ...identity, status: 'computed', artifact: fit.artifact, predictions }
}

const fitArtifactBundle = (input: {
  readonly scope: ScientificBaselineArtifactBundle['scope']
  readonly foldId: string | null
  readonly splitOriginsSha256: string
  readonly candidateTrainOrigins: readonly string[]
  readonly trainRows: readonly ScientificBaselineEvalRow[]
  readonly testRows: readonly ScientificBaselineEvalRow[]
  readonly testOrigin: string | null
  readonly study: StudyIdentity
}): ScientificBaselineArtifactBundle => {
  const fitted = fitScientificBaselines({ rows: toTrainRows(input.trainRows) })
  const predict = (row: ScientificBaselineEvalRow) => toPredictRow(row)
  const primary = input.testRows.map((row) => toEvalPrediction({
    row,
    probability: predictBAblStrataBaseline(fitted.primary, predict(row)),
  }))
  const persistence = input.testRows.map((row) => toEvalPrediction({
    row,
    probability: predictPersistenceBaseline(fitted.secondary.persistence, predict(row)),
  }))
  const climatologyArtifact = fitted.secondary.climatology
  const climatology = climatologyArtifact === null
    ? []
    : input.testRows.map((row) => toEvalPrediction({
      row,
      probability: predictClimatologyBaseline(climatologyArtifact),
    }))
  const fittedTrainOrigins = distinctOriginDates(input.trainRows)
  const trainOriginRowCounts = Object.fromEntries(input.candidateTrainOrigins.map((origin) => [
    origin,
    input.trainRows.filter((row) => row.baseDate === origin).length,
  ]))

  return {
    scope: input.scope,
    foldId: input.foldId,
    splitOriginsSha256: input.splitOriginsSha256,
    trainOrigins: input.candidateTrainOrigins,
    trainOriginRowCounts,
    testOrigin: input.testOrigin,
    primary: { artifact: fitted.primary, predictions: primary },
    secondaryDiagnostics: {
      climatology: { artifact: climatologyArtifact, predictions: climatology },
      persistence: { artifact: fitted.secondary.persistence, predictions: persistence },
      twoFeatureLogistic: twoFeatureSecondary({
        study: input.study,
        splitOriginsSha256: input.splitOriginsSha256,
        trainRows: input.trainRows,
        testRows: input.testRows,
        trainOrigins: fittedTrainOrigins,
        testOrigin: input.testOrigin,
      }),
    },
  }
}

export function buildScientificBaselineEvaluation(input: ScientificBaselineInput, lock: ScientificBaselineStudyLock): ScientificBaselineEvaluation {
  const study = resolveStudyIdentity(input.datasetManifest)
  if (study.studyContractId !== lock.studyContractId || study.studyContractSha256 !== lock.studyContractSha256) {
    throw new Error('scientific baseline input does not match the externally frozen study contract')
  }
  assertRowsMatchStudy(input.rows, study)
  const split = createStudyWalkForwardFolds({ origins: input.origins, rows: input.rows })
  const studyOriginSchedule = [...input.origins].sort((left, right) => left.originDate.localeCompare(right.originDate))
    .map((origin) => ({ originDate: origin.originDate, forecastCutoff: origin.forecastCutoff }))
  const studyOrigins = studyOriginSchedule.map((origin) => origin.originDate)
  const studyOriginScheduleSha256 = computeStudyOriginScheduleSha256({ ...study, studyOriginSchedule })
  if (lock.studyOriginScheduleSha256 !== studyOriginScheduleSha256) {
    throw new Error('scientific baseline input does not match the externally frozen study-origin schedule')
  }
  const outerFolds = split.folds.map((fold) => fitArtifactBundle({
    scope: 'outer_fold',
    foldId: fold.foldId,
    splitOriginsSha256: fold.splitOriginsSha256,
    candidateTrainOrigins: fold.candidateTrainOrigins,
    trainRows: fold.train,
    testRows: fold.test,
    testOrigin: fold.testOrigin.originDate,
    study,
  }))
  const prospectiveSplitSha256 = computeSplitOriginsSha256({
    kind: 'prospective-baseline-fit-v1',
    studyContractId: study.studyContractId,
    studyContractSha256: study.studyContractSha256,
    trainOrigins: distinctOriginDates(input.rows),
  })
  const prospectiveCycle = fitArtifactBundle({
    scope: 'prospective_cycle',
    foldId: null,
    splitOriginsSha256: prospectiveSplitSha256,
    candidateTrainOrigins: studyOrigins,
    trainRows: input.rows,
    testRows: [],
    testOrigin: null,
    study,
  })

  return {
    ...study,
    studyOriginScheduleSha256, studyOriginSchedule,
    studyOrigins,
    walkForwardSplitSha256: split.splitOriginsSha256,
    outerFolds,
    prospectiveCycle,
    primaryPredictions: outerFolds.flatMap((fold) => fold.primary.predictions),
  }
}
