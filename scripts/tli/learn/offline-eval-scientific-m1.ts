import { createInnerOofSplit, createStudyWalkForwardFolds, distinctOriginDates } from '../../../lib/tli/eval/walk-forward'
import type { InnerOofSplit, StudyOrigin } from '../../../lib/tli/eval/types'
import {
  buildConfirmatoryFeatureVector,
  CONFIRMATORY_FEATURE_NAMES,
  type ConfirmatoryFeatureInput,
  type ConfirmatoryFeatureSnapshot,
} from '../../../lib/tli/features/build-confirmatory-features'

import { CONFIRMATORY_LABELER_VERSION } from './dataset-manifest'
import { ScientificM1InputError, type ScientificM1StudyInput } from './scientific-m1-input'

export const M1_SCIENTIFIC_TRAINING_DATASET_VERSION = 'tli-m1-training-dataset-v2'

export type M1ScientificTrainingRow = {
  readonly theme_id: string
  readonly base_date: string
  readonly features: readonly number[]
  readonly missing_flags: readonly boolean[]
  readonly y: boolean
}

export type M1ScientificTrainingDataset = {
  readonly dataset_version: typeof M1_SCIENTIFIC_TRAINING_DATASET_VERSION
  readonly feature_schema: typeof CONFIRMATORY_FEATURE_NAMES
  readonly train_range: readonly [string, string]
  readonly labeler_version: typeof CONFIRMATORY_LABELER_VERSION
  readonly rows: readonly M1ScientificTrainingRow[]
}

export type ScientificM1JoinedRow = {
  readonly id: string
  readonly themeId: string
  readonly baseDate: string
  readonly futureDates: readonly string[]
  readonly labelFinalizedAt: string
  readonly labelSourceRunCompletedAt: string
  readonly studyOriginManifestId: string
  readonly forecastOriginManifestId: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly featureContractVersion: string
  readonly featureContractSha256: string
  readonly features: readonly number[]
  readonly missingFlags: readonly boolean[]
  readonly abstain: boolean
  readonly abstainReasons: readonly string[]
  readonly featureSnapshotSha256: string
  readonly y: boolean
  readonly gLogRatio: number
}

export const PURGE_REASON = {
  FUTURE_WINDOW: 'future_window_not_before_test_origin',
  LABEL_FINALIZED: 'label_finalized_after_forecast_cutoff',
  SOURCE_COMPLETED: 'label_source_run_completed_after_forecast_cutoff',
} as const

export type PurgeReason = (typeof PURGE_REASON)[keyof typeof PURGE_REASON]

export type ScientificM1PurgedRow = {
  readonly rowId: string
  readonly reasons: readonly PurgeReason[]
}

export type ScientificM1OuterFold = {
  readonly foldId: string
  readonly sequence: number
  readonly testOrigin: StudyOrigin
  readonly splitOriginsSha256: string
  readonly candidateTrainOrigins: readonly string[]
  readonly trainOrigins: readonly string[]
  readonly trainingOrigins: readonly string[]
  readonly purgedRowIds: readonly string[]
  readonly purgedRows: readonly ScientificM1PurgedRow[]
  readonly trainingDataset: M1ScientificTrainingDataset
  readonly innerOof: InnerOofSplit
  readonly testRows: readonly ScientificM1JoinedRow[]
}

export type ScientificM1ProspectiveFit = {
  readonly trainingOrigins: readonly string[]
  readonly trainingDataset: M1ScientificTrainingDataset
  readonly innerOof: InnerOofSplit
}

export type ScientificM1EvaluationPlan = {
  readonly cycleId: string
  readonly studyContractId: string
  readonly studyContractSha256: string
  readonly featureContractVersion: string
  readonly featureContractSha256: string
  readonly datasetManifestSha256: string
  readonly walkForwardSplitSha256: string
  readonly originCount: number
  readonly testOriginCount: number
  readonly studyOrigins: readonly StudyOrigin[]
  readonly rows: readonly ScientificM1JoinedRow[]
  readonly outerFolds: readonly ScientificM1OuterFold[]
  readonly prospective: ScientificM1ProspectiveFit
}

type FrozenFeature = {
  readonly input: ConfirmatoryFeatureInput
  readonly snapshot: ConfirmatoryFeatureSnapshot
}

const joinKey = (input: {
  readonly studyOriginManifestId: string
  readonly forecastOriginManifestId: string
  readonly themeId: string
  readonly baseDate: string
}): string => [
  input.studyOriginManifestId,
  input.forecastOriginManifestId,
  input.themeId,
  input.baseDate,
].join('|')

const sameStrings = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
)

const assertStudySchedule = (input: ScientificM1StudyInput): ReadonlyMap<string, StudyOrigin> => {
  const originByDate = new Map<string, StudyOrigin>()
  for (const origin of input.origins) {
    if (originByDate.has(origin.originDate)) {
      throw new ScientificM1InputError(`duplicate study origin date: ${origin.originDate}`)
    }
    originByDate.set(origin.originDate, origin)
  }
  const datasetDates = distinctOriginDates(input.dataset.rows)
  const originDates = [...originByDate.keys()].sort()
  if (!sameStrings(datasetDates, originDates)) {
    throw new ScientificM1InputError('dataset origins do not exactly match the frozen study-origin schedule')
  }
  return originByDate
}

const assertFeatureIdentity = (input: ScientificM1StudyInput, frozen: FrozenFeature): void => {
  const provenance = frozen.snapshot.provenance
  const manifest = input.dataset.manifest
  if (
    frozen.input.studyContractId !== manifest.study_contract_id
    || frozen.input.studyContractSha256 !== manifest.study_contract_sha256
    || provenance.studyContractId !== manifest.study_contract_id
    || provenance.studyContractSha256 !== manifest.study_contract_sha256
  ) throw new ScientificM1InputError(`mixed study contract in feature input: ${frozen.input.themeId}|${frozen.input.baseDate}`)
  if (
    frozen.input.featureContractVersion !== manifest.feature_contract_version
    || frozen.input.featureContractSha256 !== manifest.feature_contract_sha256
    || provenance.featureContractVersion !== manifest.feature_contract_version
    || provenance.featureContractSha256 !== manifest.feature_contract_sha256
  ) throw new ScientificM1InputError(`mixed feature contract in feature input: ${frozen.input.themeId}|${frozen.input.baseDate}`)
  if (
    provenance.studyOriginManifestId !== frozen.input.studyOriginManifestId
    || provenance.forecastOriginManifestId !== frozen.input.forecastOriginManifestId
    || provenance.themeId !== frozen.input.themeId
    || provenance.baseDate !== frozen.input.baseDate
  ) throw new ScientificM1InputError(`feature provenance identity mismatch: ${frozen.input.themeId}|${frozen.input.baseDate}`)
}

const joinRows = (input: ScientificM1StudyInput, originByDate: ReadonlyMap<string, StudyOrigin>): ScientificM1JoinedRow[] => {
  const featuresByKey = new Map<string, FrozenFeature>()
  for (const featureInput of input.featureInputs) {
    const frozen = { input: featureInput, snapshot: buildConfirmatoryFeatureVector(featureInput) }
    assertFeatureIdentity(input, frozen)
    const key = joinKey(featureInput)
    if (featuresByKey.has(key)) throw new ScientificM1InputError(`duplicate confirmatory feature input: ${key}`)
    featuresByKey.set(key, frozen)
  }
  const joinedRows = input.dataset.rows.map((row) => {
    const key = joinKey(row)
    const frozen = featuresByKey.get(key)
    if (frozen === undefined) throw new ScientificM1InputError(`missing confirmatory feature input: ${key}`)
    const origin = originByDate.get(row.baseDate)
    if (origin === undefined || frozen.input.cutoffAt !== origin.forecastCutoff) {
      throw new ScientificM1InputError(`feature cutoff does not match study origin: ${key}`)
    }
    featuresByKey.delete(key)
    return {
      id: row.id, themeId: row.themeId, baseDate: row.baseDate, futureDates: row.futureDates,
      labelFinalizedAt: row.finalizedAt, labelSourceRunCompletedAt: row.labelSourceRunCompletedAt,
      studyOriginManifestId: row.studyOriginManifestId,
      forecastOriginManifestId: row.forecastOriginManifestId,
      studyContractId: frozen.input.studyContractId, studyContractSha256: frozen.input.studyContractSha256,
      featureContractVersion: frozen.input.featureContractVersion,
      featureContractSha256: frozen.input.featureContractSha256,
      features: frozen.snapshot.values, missingFlags: frozen.snapshot.missingFlags,
      abstain: frozen.snapshot.abstain, abstainReasons: frozen.snapshot.abstainReasons,
      featureSnapshotSha256: frozen.snapshot.featureSnapshotSha256,
      y: row.yBinary, gLogRatio: row.gLogRatio,
    }
  })
  const unmatchedKey = featuresByKey.keys().next().value
  if (typeof unmatchedKey === 'string') {
    throw new ScientificM1InputError(`feature input does not match a dataset row: ${unmatchedKey}`)
  }
  return joinedRows
}

const buildTrainingDataset = (rows: readonly ScientificM1JoinedRow[]): M1ScientificTrainingDataset => {
  const cleanRows = rows.filter((row) => !row.abstain)
  const dates = distinctOriginDates(cleanRows)
  const first = dates.at(0)
  const last = dates.at(-1)
  if (first === undefined || last === undefined) throw new ScientificM1InputError('M1 training dataset has no non-abstain rows')
  return {
    dataset_version: M1_SCIENTIFIC_TRAINING_DATASET_VERSION,
    feature_schema: CONFIRMATORY_FEATURE_NAMES,
    train_range: [first, last],
    labeler_version: CONFIRMATORY_LABELER_VERSION,
    rows: cleanRows.map((row) => ({
      theme_id: row.themeId, base_date: row.baseDate, features: row.features,
      missing_flags: row.missingFlags, y: row.y,
    })),
  }
}

const classifyPurge = (row: ScientificM1JoinedRow, testOrigin: StudyOrigin): ScientificM1PurgedRow => {
  const reasons: PurgeReason[] = []
  const maximumFuture = [...row.futureDates].sort().at(-1)
  if (maximumFuture === undefined || maximumFuture >= testOrigin.originDate) reasons.push(PURGE_REASON.FUTURE_WINDOW)
  const cutoff = Date.parse(testOrigin.forecastCutoff)
  if (Date.parse(row.labelFinalizedAt) > cutoff) reasons.push(PURGE_REASON.LABEL_FINALIZED)
  if (Date.parse(row.labelSourceRunCompletedAt) > cutoff) reasons.push(PURGE_REASON.SOURCE_COMPLETED)
  if (reasons.length === 0) throw new ScientificM1InputError(`walk-forward purged an unclassified row: ${row.id}`)
  return { rowId: row.id, reasons }
}

export function buildScientificM1EvaluationPlan(input: ScientificM1StudyInput): ScientificM1EvaluationPlan {
  const originByDate = assertStudySchedule(input)
  const rows = joinRows(input, originByDate)
  const split = createStudyWalkForwardFolds({ origins: input.origins, rows })
  const outerFolds = split.folds.map((fold): ScientificM1OuterFold => {
    const trainingDataset = buildTrainingDataset(fold.train)
    const trainingOrigins = distinctOriginDates(fold.train.filter((row) => !row.abstain))
    const purgedRows = fold.purged.map((row) => classifyPurge(row, fold.testOrigin))
    return {
      foldId: fold.foldId, sequence: fold.sequence, testOrigin: fold.testOrigin,
      splitOriginsSha256: fold.splitOriginsSha256,
      candidateTrainOrigins: fold.candidateTrainOrigins, trainOrigins: fold.trainOrigins, trainingOrigins,
      purgedRowIds: fold.purged.map((row) => row.id), purgedRows,
      trainingDataset, innerOof: createInnerOofSplit(trainingOrigins), testRows: fold.test,
    }
  })
  const prospectiveDataset = buildTrainingDataset(rows)
  const prospectiveOrigins = distinctOriginDates(rows.filter((row) => !row.abstain))
  return {
    cycleId: input.cycleId,
    studyContractId: input.dataset.manifest.study_contract_id,
    studyContractSha256: input.dataset.manifest.study_contract_sha256,
    featureContractVersion: input.dataset.manifest.feature_contract_version,
    featureContractSha256: input.dataset.manifest.feature_contract_sha256,
    datasetManifestSha256: input.dataset.manifestSha256,
    walkForwardSplitSha256: split.splitOriginsSha256,
    originCount: split.originCount, testOriginCount: split.testOriginCount,
    studyOrigins: input.origins,
    rows, outerFolds,
    prospective: {
      trainingOrigins: prospectiveOrigins,
      trainingDataset: prospectiveDataset,
      innerOof: createInnerOofSplit(prospectiveOrigins),
    },
  }
}
