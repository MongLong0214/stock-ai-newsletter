import {
  computeBrierDeltaCi,
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
  type BrierDeltaCi,
  type EvalPredictionRow,
  type PredictionEvaluationSummary,
  type PredictionMetrics,
} from '../../../lib/tli/eval/harness'

export const REPLAY_AUDIT_REPORT_VERSION = 'tli-replay-audit-v1'
export const REPLAY_AUDIT_TRAIN_START = '2026-01-07'
export const REPLAY_AUDIT_TRAIN_END = '2026-05-29'
export const REPLAY_AUDIT_REPLAY_START = '2026-06-08'
export const REPLAY_AUDIT_REPLAY_END = '2026-06-26'

export const REPLAY_AUDIT_CRITERIA = {
  m1BrierBelowBAbl: 'm1_brier_lt_b_abl',
  m1BrierAbsolute: 0.21,
  m1EceMax: 0.08,
  m1IcPositive: 0,
} as const

export interface ReplayAuditPredictionRow {
  readonly themeId: string
  readonly baseDate: string
  readonly pRiseM1: number | null
  readonly pRiseBAbl: number | null
}

export type ReplayAuditLabelStatus = 'pending' | 'final' | 'censored' | 'excluded'

export interface ReplayAuditLabelRow {
  readonly themeId: string
  readonly baseDate: string
  readonly labelStatus: ReplayAuditLabelStatus
  readonly yBinary: boolean | null
}

export interface ReplayAuditScoredRow extends ReplayAuditPredictionRow {
  readonly label: boolean
}

export interface ReplayAuditJoinResult {
  readonly rows: readonly ReplayAuditScoredRow[]
  readonly excludedRows: number
}

export interface ReplayAuditCriteriaResult {
  readonly m1BrierBelowBAbl: boolean
  readonly m1BrierAbsolute: boolean
  readonly m1EceMax: boolean
  readonly m1IcPositive: boolean
}

export interface ReplayAuditReport {
  readonly reportVersion: typeof REPLAY_AUDIT_REPORT_VERSION
  readonly trainEnd: string
  readonly replayStart: string
  readonly replayEnd: string
  readonly scoredRows: number
  readonly excludedRows: number
  readonly tradingDays: readonly string[]
  readonly metrics: {
    readonly m1: PredictionMetrics
    readonly bAbl: PredictionMetrics
  }
  readonly weeklyNonOverlap: {
    readonly m1: PredictionMetrics
    readonly bAbl: PredictionMetrics
  }
  readonly brierDeltaCi: BrierDeltaCi
  readonly criteria: ReplayAuditCriteriaResult
  readonly verdict: 'pass' | 'fail'
}

export interface BuildReplayAuditReportInput {
  readonly trainEnd: string
  readonly replayStart: string
  readonly replayEnd: string
  readonly tradingDays: readonly string[]
  readonly scoredRows: readonly ReplayAuditScoredRow[]
  readonly excludedRows: number
  readonly brierDeltaIterations?: number
}

const replayRowId = (themeId: string, baseDate: string): string => `${themeId}|${baseDate}`

const isFiniteMetric = (value: number | null): value is number => value !== null && Number.isFinite(value)

const formatNumber = (value: number | null): string => (
  value === null || !Number.isFinite(value) ? 'n/a' : value.toFixed(4)
)

const toEvalRows = (
  rows: readonly ReplayAuditScoredRow[],
  model: 'm1' | 'bAbl',
): EvalPredictionRow[] => rows.map((row) => ({
  id: replayRowId(row.themeId, row.baseDate),
  themeId: row.themeId,
  baseDate: row.baseDate,
  probability: model === 'm1' ? row.pRiseM1 : row.pRiseBAbl,
  y: row.label,
}))

const computeReplayBrierDeltaCi = (input: {
  readonly bAblSummaryRows: readonly EvalPredictionRow[]
  readonly m1SummaryRows: readonly EvalPredictionRow[]
  readonly iterations?: number
}): BrierDeltaCi => {
  const baseline = selectWeeklyMondaySubset(input.bAblSummaryRows)
  const candidate = selectWeeklyMondaySubset(input.m1SummaryRows)
  if (input.iterations === undefined) {
    return computeBrierDeltaCi({ baseline, candidate, confidenceLevel: 0.99 })
  }
  return computeBrierDeltaCi({ baseline, candidate, confidenceLevel: 0.99, iterations: input.iterations })
}

export function joinReplayRowsWithFinalLabels(input: {
  readonly predictionRows: readonly ReplayAuditPredictionRow[]
  readonly labelRows: readonly ReplayAuditLabelRow[]
}): ReplayAuditJoinResult {
  const labelsById = new Map(input.labelRows.map((label) => [replayRowId(label.themeId, label.baseDate), label]))
  const rows: ReplayAuditScoredRow[] = []
  let excludedRows = 0

  for (const prediction of input.predictionRows) {
    const label = labelsById.get(replayRowId(prediction.themeId, prediction.baseDate))
    if (!label || label.labelStatus !== 'final' || label.yBinary === null) {
      excludedRows++
      continue
    }
    rows.push({ ...prediction, label: label.yBinary })
  }

  return { rows, excludedRows }
}

export function evaluateReplayAuditCriteria(input: {
  readonly m1: PredictionMetrics
  readonly bAbl: PredictionMetrics
}): ReplayAuditCriteriaResult {
  return {
    m1BrierBelowBAbl: isFiniteMetric(input.m1.brier) && isFiniteMetric(input.bAbl.brier)
      ? input.m1.brier < input.bAbl.brier
      : false,
    m1BrierAbsolute: isFiniteMetric(input.m1.brier)
      ? input.m1.brier <= REPLAY_AUDIT_CRITERIA.m1BrierAbsolute
      : false,
    m1EceMax: isFiniteMetric(input.m1.ece)
      ? input.m1.ece <= REPLAY_AUDIT_CRITERIA.m1EceMax
      : false,
    m1IcPositive: isFiniteMetric(input.m1.ic)
      ? input.m1.ic > REPLAY_AUDIT_CRITERIA.m1IcPositive
      : false,
  }
}

export function buildReplayAuditReport(input: BuildReplayAuditReportInput): ReplayAuditReport {
  const m1Rows = toEvalRows(input.scoredRows, 'm1')
  const bAblRows = toEvalRows(input.scoredRows, 'bAbl')
  const m1Summary: PredictionEvaluationSummary = evaluateWithWeeklyMondaySubset(m1Rows)
  const bAblSummary: PredictionEvaluationSummary = evaluateWithWeeklyMondaySubset(bAblRows)
  const criteria = evaluateReplayAuditCriteria({ m1: m1Summary.raw, bAbl: bAblSummary.raw })
  const verdict = Object.values(criteria).every((passed) => passed) ? 'pass' : 'fail'

  return {
    reportVersion: REPLAY_AUDIT_REPORT_VERSION,
    trainEnd: input.trainEnd,
    replayStart: input.replayStart,
    replayEnd: input.replayEnd,
    scoredRows: input.scoredRows.length,
    excludedRows: input.excludedRows,
    tradingDays: [...input.tradingDays],
    metrics: {
      m1: m1Summary.raw,
      bAbl: bAblSummary.raw,
    },
    weeklyNonOverlap: {
      m1: m1Summary.weeklyMonday,
      bAbl: bAblSummary.weeklyMonday,
    },
    brierDeltaCi: computeReplayBrierDeltaCi({
      bAblSummaryRows: bAblRows,
      m1SummaryRows: m1Rows,
      iterations: input.brierDeltaIterations,
    }),
    criteria,
    verdict,
  }
}

export function renderReplayAuditMarkdown(report: ReplayAuditReport): string {
  const modelRows = [
    ['M1', report.metrics.m1, report.weeklyNonOverlap.m1],
    ['B-abl', report.metrics.bAbl, report.weeklyNonOverlap.bAbl],
  ] as const
  const criteriaRows = [
    ['M1 Brier < B-abl Brier', report.criteria.m1BrierBelowBAbl],
    [`M1 Brier <= ${REPLAY_AUDIT_CRITERIA.m1BrierAbsolute}`, report.criteria.m1BrierAbsolute],
    [`M1 ECE <= ${REPLAY_AUDIT_CRITERIA.m1EceMax}`, report.criteria.m1EceMax],
    ['M1 IC > 0', report.criteria.m1IcPositive],
  ] as const

  return [
    '# TLI Replay Audit',
    '',
    `Train end: ${report.trainEnd}`,
    `Replay window: ${report.replayStart} to ${report.replayEnd}`,
    `Rows: scored ${report.scoredRows}, excluded ${report.excludedRows}, trading days ${report.tradingDays.length}`,
    '',
    '| Model | raw n | scored n | coverage | Brier | ECE | IC | Rising-P@10 | weekly scored n | weekly Brier |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...modelRows.map(([name, raw, weekly]) => (
      `| ${name} | ${raw.totalCandidates} | ${raw.nScored} | ${formatNumber(raw.coverage)} | ${formatNumber(raw.brier)} | ${formatNumber(raw.ece)} | ${formatNumber(raw.ic)} | ${formatNumber(raw.risingPAt10)} | ${weekly.nScored} | ${formatNumber(weekly.brier)} |`
    )),
    '',
    '| Criterion | Pass |',
    '| --- | --- |',
    ...criteriaRows.map(([name, passed]) => `| ${name} | ${passed ? 'yes' : 'no'} |`),
    '',
    '| Brier delta CI | Method | Mean delta | Lower | Upper | Clusters | Observations |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    `| M1 vs B-abl | ${report.brierDeltaCi.method} | ${formatNumber(report.brierDeltaCi.meanDelta)} | ${formatNumber(report.brierDeltaCi.lower)} | ${formatNumber(report.brierDeltaCi.upper)} | ${report.brierDeltaCi.clusterCount} | ${report.brierDeltaCi.observationCount} |`,
    '',
    `| Verdict | ${report.verdict} |`,
    '',
  ].join('\n')
}
