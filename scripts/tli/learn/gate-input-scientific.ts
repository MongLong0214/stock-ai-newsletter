import {
  buildPromotionGateInputFromRows,
  type ModelRegistryHistoryRow,
  type ScoredPredictionRow,
} from './gate-input-metrics'
import {
  ScientificGateInputBlockedError,
  type ScientificCompletenessReport,
  type ScientificExpectedTheme,
  type ScientificGateIssue,
  type ScientificGateIssueCode,
  type ScientificGatePredictionRow,
  type ScientificOriginCompleteness,
  type ScientificPromotionGateInputResult,
} from './gate-input-scientific-contract'

export * from './gate-input-scientific-contract'

const expectedKey = (row: ScientificExpectedTheme): string => [
  row.originId, row.themeId, row.predictionDate, row.horizonDays, row.labelerVersion,
].join('|')

const matchesExpected = (row: ScientificGatePredictionRow, expected: ScientificExpectedTheme): boolean => (
  row.experiment_origin_manifest_id === expected.originId
  && row.theme_id === expected.themeId
  && row.prediction_date === expected.predictionDate
  && row.horizon_days === expected.horizonDays
  && row.labeler_version === expected.labelerVersion
)

const metricRow = (row: ScientificGatePredictionRow, actualY: boolean): ScoredPredictionRow => ({
  theme_id: row.theme_id,
  prediction_date: row.prediction_date,
  p_rise: row.p_rise,
  abstain: row.abstain,
  actual_y: actualY,
})

const finiteProbability = (row: ScientificGatePredictionRow): boolean => row.p_rise !== null
  && Number.isFinite(row.p_rise) && row.p_rise >= 0 && row.p_rise <= 1

const validInterval = (row: ScientificGatePredictionRow): boolean => {
  if (row.abstain) return true
  const { p_rise: probability, ci_lower: lower, ci_upper: upper } = row
  return probability !== null && finiteProbability(row) && lower !== null && upper !== null
    && Number.isFinite(lower) && Number.isFinite(upper)
    && lower >= 0 && lower <= probability && probability <= upper && upper <= 1
}

interface MutableOriginCompleteness {
  expectedPairCount: number
  terminalPairCount: number
  candidateNonAbstainCount: number
  sourceGapSlaCount: number
}

const FAIL_CLOSED_ISSUES: ReadonlySet<ScientificGateIssueCode> = new Set([
  'TERMINAL_MISMATCH',
  'LABEL_MISMATCH',
  'EXCLUSION_REASON_MISMATCH',
  'NULL_SCORED_OUTCOME',
  'INVALID_PROBABILITY',
  'INVALID_INTERVAL',
])

export function buildScientificPromotionGateInputFromRows(input: {
  readonly cycleId: string
  readonly asOfDate: string
  readonly expectedThemes: readonly ScientificExpectedTheme[]
  readonly predictions: readonly ScientificGatePredictionRow[]
  readonly registryHistory: readonly ModelRegistryHistoryRow[]
}): ScientificPromotionGateInputResult {
  const scoped = input.predictions.filter((row) => row.experiment_cycle_id === input.cycleId)
  const issues: ScientificGateIssue[] = []
  const candidateRows: ScoredPredictionRow[] = []
  const comparatorRows: ScoredPredictionRow[] = []
  const originCounts = new Map<string, MutableOriginCompleteness>()
  const excludedReasons = new Map<string, number>()
  let candidateNonAbstainCount = 0
  let terminalPairCount = 0

  const uniqueExpected = new Set(input.expectedThemes.map(expectedKey))
  if (input.expectedThemes.length === 0 || uniqueExpected.size !== input.expectedThemes.length) {
    const report: ScientificCompletenessReport = {
      partial: true,
      expectedPairCount: input.expectedThemes.length,
      terminalPairCount: 0,
      exactPairedScoredCount: 0,
      ratio: 0,
      candidateNonAbstainCount: 0,
      coverage: 0,
      excludedReasonCounts: [],
      originCompleteness: [],
      issues: [],
    }
    throw new ScientificGateInputBlockedError(report)
  }

  for (const expected of input.expectedThemes) {
    const counts = originCounts.get(expected.originId) ?? {
      expectedPairCount: 0,
      terminalPairCount: 0,
      candidateNonAbstainCount: 0,
      sourceGapSlaCount: 0,
    }
    counts.expectedPairCount++
    originCounts.set(expected.originId, counts)
  }

  const getOriginCounts = (originId: string): MutableOriginCompleteness => {
    const counts = originCounts.get(originId)
    if (counts === undefined) throw new Error(`expected origin disappeared: ${originId}`)
    return counts
  }

  const markTerminal = (originId: string): void => {
    getOriginCounts(originId).terminalPairCount++
    terminalPairCount++
  }

  const markCandidateNonAbstain = (originId: string): void => {
    getOriginCounts(originId).candidateNonAbstainCount++
    candidateNonAbstainCount++
  }

  const markExcluded = (originId: string, reason: string): void => {
    excludedReasons.set(reason, (excludedReasons.get(reason) ?? 0) + 1)
    if (reason === 'source_gap_sla') getOriginCounts(originId).sourceGapSlaCount++
  }

  const unexpectedKeys = new Set<string>()
  for (const row of scoped) {
    const key = [
      row.experiment_origin_manifest_id,
      row.theme_id,
      row.prediction_date,
      row.horizon_days,
      row.labeler_version,
    ].join('|')
    if (uniqueExpected.has(key) || unexpectedKeys.has(key)) continue
    unexpectedKeys.add(key)
    issues.push({
      originId: row.experiment_origin_manifest_id,
      themeId: row.theme_id,
      code: 'UNEXPECTED_PREDICTION',
    })
  }

  for (const expected of input.expectedThemes) {
    const rows = scoped.filter((row) => matchesExpected(row, expected))
    const candidates = rows.filter((row) => row.scientific_prediction_role === 'candidate')
    const comparators = rows.filter((row) => row.scientific_prediction_role === 'comparator')
    if (candidates.length === 1 && !candidates[0].abstain) markCandidateNonAbstain(expected.originId)
    if (rows.length !== 2 || candidates.length !== 1 || comparators.length !== 1) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'ROLE_CARDINALITY' })
      continue
    }
    const candidate = candidates[0]
    const comparator = comparators[0]
    const bothExcluded = candidate.score_status === 'excluded' && comparator.score_status === 'excluded'
    const bothScored = candidate.score_status === 'scored' && comparator.score_status === 'scored'
    if (!bothExcluded && !bothScored) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'TERMINAL_MISMATCH' })
      continue
    }
    if (candidate.actual_label_id === null || candidate.actual_label_id !== comparator.actual_label_id) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'LABEL_MISMATCH' })
      continue
    }
    const exclusionReason = bothExcluded
      && candidate.score_exclusion_reason !== null
      && candidate.score_exclusion_reason === comparator.score_exclusion_reason
      ? candidate.score_exclusion_reason
      : null
    if ((bothExcluded && exclusionReason === null)
      || (bothScored && (candidate.score_exclusion_reason !== null
        || comparator.score_exclusion_reason !== null))) {
      issues.push({
        originId: expected.originId,
        themeId: expected.themeId,
        code: 'EXCLUSION_REASON_MISMATCH',
      })
      continue
    }
    if (bothExcluded) {
      if (exclusionReason === null) throw new Error('validated exclusion reason disappeared')
      markExcluded(expected.originId, exclusionReason)
    }
    if ((!candidate.abstain && !finiteProbability(candidate))
      || (!comparator.abstain && !finiteProbability(comparator))) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'INVALID_PROBABILITY' })
      continue
    }
    if (!validInterval(candidate) || !validInterval(comparator)) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'INVALID_INTERVAL' })
      continue
    }
    if (bothExcluded) {
      markTerminal(expected.originId)
      continue
    }
    if (candidate.actual_y === null || comparator.actual_y === null || candidate.actual_y !== comparator.actual_y) {
      issues.push({ originId: expected.originId, themeId: expected.themeId, code: 'NULL_SCORED_OUTCOME' })
      continue
    }
    markTerminal(expected.originId)
    if (candidate.abstain || comparator.abstain) continue
    candidateRows.push(metricRow(candidate, candidate.actual_y))
    comparatorRows.push(metricRow(comparator, comparator.actual_y))
  }

  const ratio = terminalPairCount / input.expectedThemes.length
  const coverage = candidateNonAbstainCount / input.expectedThemes.length
  const originCompleteness: ScientificOriginCompleteness[] = [...originCounts]
    .map(([originId, counts]) => ({
      originId,
      ...counts,
      ratio: counts.terminalPairCount / counts.expectedPairCount,
      coverage: counts.candidateNonAbstainCount / counts.expectedPairCount,
      sourceGapSlaRatio: counts.sourceGapSlaCount / counts.expectedPairCount,
    }))
    .sort((left, right) => left.originId.localeCompare(right.originId))
  const excludedReasonCounts = [...excludedReasons]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => left.reason.localeCompare(right.reason))
  const sourceGapExceeded = originCompleteness.some((origin) => origin.sourceGapSlaRatio > 0.01)
  const report: ScientificCompletenessReport = {
    partial: issues.length > 0 || sourceGapExceeded,
    expectedPairCount: input.expectedThemes.length,
    terminalPairCount,
    exactPairedScoredCount: candidateRows.length,
    ratio,
    candidateNonAbstainCount,
    coverage,
    excludedReasonCounts,
    originCompleteness,
    issues,
  }
  if (
    ratio < 0.99
    || originCompleteness.some((origin) => origin.ratio < 0.99)
    || sourceGapExceeded
    || issues.some((issue) => FAIL_CLOSED_ISSUES.has(issue.code))
  ) throw new ScientificGateInputBlockedError(report)
  return {
    gateInput: buildPromotionGateInputFromRows({
      asOfDate: input.asOfDate,
      championScored: comparatorRows,
      challengerScored: candidateRows,
      registryHistory: input.registryHistory,
    }),
    completeness: report,
  }
}
