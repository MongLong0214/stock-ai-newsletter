import { FEATURE_NAMES } from '../../../lib/tli/features/build-features'
import type { BaselineFeatureRow, BaselineGtLabelRow, BaselineSnapshotRow } from '../../../lib/tli/model/baselines'
import { predictM1Probability, type M1ModelArtifact } from '../../../lib/tli/model/m1'
import { applyPriorCorrection, computeTrailingFinalBaseRate } from '../../../lib/tli/model/prior-correction'
import {
  computeBrierDeltaCi,
  createWalkForwardFolds,
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
  type BrierDeltaCi,
  type EvalPredictionRow,
  type PredictionEvaluationSummary,
} from '../../../lib/tli/eval/harness'
import {
  buildScientificBaselineEvaluation,
  type ScientificBaselineEvaluation,
  type ScientificBaselineInput,
} from './offline-eval-baselines'
import {
  buildScientificBaselineGateInput,
  createScientificBaselineGateInputSchema,
  type ScientificBaselineGateInput,
} from './offline-eval-baseline-gate'
import type { ScientificBaselineStudyLock } from './offline-eval-study-lock'

export { createScientificBaselineGateInputSchema }

export const OFFLINE_EVAL_REPORT_VERSION = 'tli-offline-eval-report-v2'
export const M1_TRAINING_DATASET_VERSION = 'tli-m1-training-dataset-v1'

export interface LabelStatusCounts {
  readonly final: number
  readonly censored: number
  readonly excluded: number
  readonly pending: number
}

export interface OfflineEvalInput {
  readonly startDate: string
  readonly endDate: string
  readonly labels: readonly BaselineGtLabelRow[]
  readonly snapshots: readonly BaselineSnapshotRow[]
  readonly featureRows: readonly BaselineFeatureRow[]
  readonly labelStatusCounts: LabelStatusCounts
  readonly scientificBaseline?: ScientificBaselineInput
  readonly m1Predictions?: readonly EvalPredictionRow[]
  readonly m1TrainingFailures?: readonly M1TrainingFailure[]
}

export interface M1TrainingFailure {
  readonly foldId: string
  readonly reason: string
  readonly trainRows: number
  readonly testRows: number
}

export interface M1TrainingDatasetDump {
  readonly dataset_version: typeof M1_TRAINING_DATASET_VERSION
  readonly feature_schema: readonly string[]
  readonly train_range: readonly [string, string]
  readonly labeler_version: string
  readonly rows: readonly {
    readonly theme_id: string
    readonly base_date: string
    readonly features: readonly number[]
    readonly missing_flags: readonly boolean[]
    readonly y: boolean
  }[]
}

export interface OfflineEvalReport {
  readonly reportVersion: typeof OFFLINE_EVAL_REPORT_VERSION
  readonly startDate: string
  readonly endDate: string
  readonly models: {
    readonly bAbl: PredictionEvaluationSummary
    readonly m1: PredictionEvaluationSummary
  }
  readonly brierDeltaCi: {
    /** B-4: 5일 horizon 겹침 자기상관으로 CI가 낙관 왜곡되므로 비중복(주 1 기준일) 서브셋으로 계산 — 게이팅 기준 */
    readonly m1VsBAbl: BrierDeltaCi
    /** 겹침(전체) 표본의 참고용 CI — 게이팅에는 사용하지 않는다 */
    readonly m1VsBAblOverlappingRaw: BrierDeltaCi
  }
  readonly baselines: ScientificBaselineEvaluation
  readonly baselineGateInput: ScientificBaselineGateInput
  readonly labelStatus: LabelStatusCounts & {
    readonly total: number
    readonly censoredRate: number
    readonly excludedRate: number
  }
  readonly folds: readonly {
    readonly foldId: string
    readonly trainRows: number
    readonly testRows: number
    readonly trainDateRange: { readonly start: string; readonly end: string } | null
    readonly testDateRange: { readonly start: string; readonly end: string }
    readonly trainClusterCount: number
    readonly testClusterCount: number
  }[]
  readonly m1TrainingFailures: readonly M1TrainingFailure[]
}

const makeId = (themeId: string, baseDate: string) => `${themeId}|${baseDate}`

const restrictToIds = (rows: readonly EvalPredictionRow[], ids: ReadonlySet<string> | null): EvalPredictionRow[] => (
  ids === null ? [...rows] : rows.filter((row) => ids.has(row.id))
)

export function buildM1Predictions(
  featureRows: readonly BaselineFeatureRow[],
  artifact: M1ModelArtifact,
  labels: readonly BaselineGtLabelRow[] = [],
): EvalPredictionRow[] {
  const recentRatesByDate = new Map<string, number | null>()
  const recentRateForDate = (baseDate: string): number | null => {
    const cached = recentRatesByDate.get(baseDate)
    if (cached !== undefined) return cached
    const recentRate = computeTrailingFinalBaseRate(labels, baseDate)
    recentRatesByDate.set(baseDate, recentRate)
    return recentRate
  }

  return featureRows.map((row) => {
    const probability = predictM1Probability(artifact, row)
    const recentRate = artifact.train_event_rate === undefined || probability === null
      ? null
      : recentRateForDate(row.baseDate)
    return {
      id: makeId(row.themeId, row.baseDate),
      themeId: row.themeId,
      baseDate: row.baseDate,
      probability: probability === null || artifact.train_event_rate === undefined || recentRate === null
        ? probability
        : applyPriorCorrection(probability, artifact.train_event_rate, recentRate),
      y: row.y,
    }
  })
}

export function buildM1TrainingDatasetDump(input: {
  readonly rows: readonly BaselineFeatureRow[]
  readonly labelerVersion: string
}): M1TrainingDatasetDump {
  const trainRows = input.rows.filter((row) => !row.abstain)
  const dates = trainRows.map((row) => row.baseDate).sort()
  if (dates.length === 0) throw new Error('M1 training dataset has no non-abstain rows')
  return {
    dataset_version: M1_TRAINING_DATASET_VERSION,
    feature_schema: FEATURE_NAMES,
    train_range: [dates[0], dates[dates.length - 1]],
    labeler_version: input.labelerVersion,
    rows: trainRows.map((row) => ({
      theme_id: row.themeId,
      base_date: row.baseDate,
      features: row.values,
      missing_flags: row.missingFlags,
      y: row.y,
    })),
  }
}

export function summarizeWalkForwardFolds(rows: readonly BaselineFeatureRow[]) {
  return createWalkForwardFolds(rows.map((row) => ({
    ...row,
    id: makeId(row.themeId, row.baseDate),
  }))).map((fold) => ({
    foldId: fold.foldId,
    trainRows: fold.train.length,
    testRows: fold.test.length,
    trainDateRange: fold.trainDateRange,
    testDateRange: fold.testDateRange,
    trainClusterCount: fold.trainClusterCount,
    testClusterCount: fold.testClusterCount,
  }))
}

export function buildOfflineEvalReport(
  input: OfflineEvalInput,
  studyLock: ScientificBaselineStudyLock,
): OfflineEvalReport {
  if (input.scientificBaseline === undefined) {
    throw new Error('offline evaluation requires an immutable scientificBaseline study contract')
  }
  const m1Predictions = input.m1Predictions ?? []
  const evalIds = m1Predictions.length === 0 ? null : new Set(m1Predictions.map((row) => row.id))
  const baselines = buildScientificBaselineEvaluation(input.scientificBaseline, studyLock)
  const baselineGateInput = buildScientificBaselineGateInput(baselines, studyLock)
  const bAbl = restrictToIds(baselines.primaryPredictions, evalIds)
  const m1 = restrictToIds(m1Predictions, evalIds)
  const totalLabels = Object.values(input.labelStatusCounts).reduce((sum, count) => sum + count, 0)

  // B-4: 5일 horizon이 겹치는 표본을 그대로 부트스트랩하면 자기상관 때문에 CI가 낙관적으로 좁아진다.
  // 게이팅에 쓰는 CI는 반드시 비중복(주 1 기준일) 서브셋으로 계산한다. nEff(challenger 표본 크기)도
  // 동일한 weekly-Monday 정의를 쓰므로(gate-input-from-db.ts) 두 값이 같은 표본 정의에 결속된다.
  const bAblNonOverlapping = selectWeeklyMondaySubset(bAbl)
  const m1NonOverlapping = selectWeeklyMondaySubset(m1)

  return {
    reportVersion: OFFLINE_EVAL_REPORT_VERSION,
    startDate: input.startDate,
    endDate: input.endDate,
    models: {
      bAbl: evaluateWithWeeklyMondaySubset(bAbl),
      m1: evaluateWithWeeklyMondaySubset(m1),
    },
    brierDeltaCi: {
      m1VsBAbl: computeBrierDeltaCi({ baseline: bAblNonOverlapping, candidate: m1NonOverlapping, confidenceLevel: 0.99 }),
      m1VsBAblOverlappingRaw: computeBrierDeltaCi({ baseline: bAbl, candidate: m1, confidenceLevel: 0.99 }),
    },
    baselines,
    baselineGateInput,
    labelStatus: {
      ...input.labelStatusCounts,
      total: totalLabels,
      censoredRate: totalLabels === 0 ? 0 : input.labelStatusCounts.censored / totalLabels,
      excludedRate: totalLabels === 0 ? 0 : input.labelStatusCounts.excluded / totalLabels,
    },
    folds: summarizeWalkForwardFolds(input.featureRows),
    m1TrainingFailures: input.m1TrainingFailures ?? [],
  }
}

const formatNumber = (value: number | null): string => (
  value === null || !Number.isFinite(value) ? 'n/a' : value.toFixed(4)
)

export function renderOfflineEvalMarkdown(report: OfflineEvalReport): string {
  const modelRows = Object.entries(report.models).map(([name, summary]) => (
    `| ${name} | ${summary.rawN} | ${summary.nonOverlappingN} | ${formatNumber(summary.raw.brier)} | ${formatNumber(summary.raw.ece)} | ${formatNumber(summary.raw.ic)} | ${formatNumber(summary.raw.risingPAt10)} |`
  ))
  const ciRows = Object.entries(report.brierDeltaCi).map(([name, ci]) => (
    `| ${name} | ${ci.method} | ${formatNumber(ci.meanDelta)} | ${formatNumber(ci.lower)} | ${formatNumber(ci.upper)} | ${ci.clusterCount} | ${ci.observationCount} |`
  ))
  return [
    '# TLI Offline Evaluation',
    '',
    `Window: ${report.startDate} to ${report.endDate}`,
    `Label status: final ${report.labelStatus.final}, censored ${report.labelStatus.censored} (${formatNumber(report.labelStatus.censoredRate)}), excluded ${report.labelStatus.excluded} (${formatNumber(report.labelStatus.excludedRate)}), pending ${report.labelStatus.pending}`,
    '',
    '| Model | raw n | weekly n | Brier | ECE | IC | Rising-P@10 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...modelRows,
    '',
    '| Delta | CI method | mean Brier delta | lower | upper | clusters | observations |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...ciRows,
    '',
    `Walk-forward folds: ${report.folds.length}`,
    `M1 training failures: ${report.m1TrainingFailures.length}`,
    '',
  ].join('\n')
}
