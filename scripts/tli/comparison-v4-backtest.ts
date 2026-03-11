import { renderPowerAnalysisReport } from '../../lib/tli/stats/comparison-stats'
import { assignRollingOriginFolds } from '../../lib/tli/stats/comparison-stats'
import { buildRolloutReport } from './comparison-v4-replay'

export interface ThresholdSweepFoldResult {
  threshold: number
  fold: string
  matches: number
  accurate: number
  precision: number
}

export interface AggregatedThresholdSweepResult {
  threshold: number
  meanPrecision: number
  totalMatches: number
  totalAccurate: number
}

interface GenericFold<T> {
  foldId: string
  train: T[]
  validation: T[]
  embargo: T[]
  test: T[]
}

export function buildTemporalBacktestFolds<T extends { firstSpikeDate: string }>(
  items: T[],
  minFolds = 3,
): GenericFold<T & { runDate: string }>[] {
  const observations = items
    .filter((item) => item.firstSpikeDate)
    .sort((a, b) => a.firstSpikeDate.localeCompare(b.firstSpikeDate))
    .map((item) => ({ ...item, runDate: item.firstSpikeDate }))

  const folds = assignRollingOriginFolds(observations, minFolds)
  return folds.map((fold, idx) => ({
    ...fold,
    foldId: `fold-${idx + 1}`,
  }))
}

export function selectArchetypeCandidatesAtRunDate<T extends { id: string }>(
  candidates: T[],
  input: {
    runDate: string
    stateHistory: Array<{
      theme_id: string
      effective_from: string
      effective_to: string | null
      is_active: boolean
      closed_at: string | null
      state_version?: string
    }>
  },
) {
  return candidates.filter((candidate) => {
    const states = input.stateHistory.filter((row) => row.theme_id === candidate.id)
    return states.some((row) => {
      // unknown state_version → excluded from primary archetype pool
      if (row.state_version === 'unknown') return false
      const started = row.effective_from <= input.runDate
      const notEnded = row.effective_to == null || row.effective_to >= input.runDate
      const closedBeforeRun = row.closed_at != null && row.closed_at <= input.runDate
      return started && notEnded && !row.is_active && closedBeforeRun
    })
  })
}

export function aggregateThresholdSweepResults(rows: ThresholdSweepFoldResult[]): AggregatedThresholdSweepResult[] {
  const byThreshold = new Map<number, ThresholdSweepFoldResult[]>()
  for (const row of rows) {
    const list = byThreshold.get(row.threshold) || []
    list.push(row)
    byThreshold.set(row.threshold, list)
  }

  return [...byThreshold.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([threshold, values]) => ({
      threshold,
      meanPrecision: values.reduce((sum, value) => sum + value.precision, 0) / values.length,
      totalMatches: values.reduce((sum, value) => sum + value.matches, 0),
      totalAccurate: values.reduce((sum, value) => sum + value.accurate, 0),
    }))
}

export function runThresholdSweepAcrossFolds<T>(input: {
  folds: Array<GenericFold<T>>
  thresholds: number[]
  evaluateFold: (args: { foldId: string; threshold: number; fold: GenericFold<T> }) => { matches: number; accurate: number }
}): ThresholdSweepFoldResult[] {
  const results: ThresholdSweepFoldResult[] = []

  for (const fold of input.folds) {
    for (const threshold of input.thresholds) {
      const evaluated = input.evaluateFold({ foldId: fold.foldId, threshold, fold })
      const precision = evaluated.matches > 0 ? evaluated.accurate / evaluated.matches : 0
      results.push({
        threshold,
        fold: fold.foldId,
        matches: evaluated.matches,
        accurate: evaluated.accurate,
        precision,
      })
    }
  }

  return results
}

export function selectBestThreshold(rows: AggregatedThresholdSweepResult[]) {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => b.meanPrecision - a.meanPrecision || b.threshold - a.threshold)[0]
}

export function renderThresholdSweepSummary(input: {
  selectedThreshold: number
  rows: AggregatedThresholdSweepResult[]
}) {
  return [
    '# Comparison v4 Threshold Sweep',
    '',
    `Selected Threshold: ${input.selectedThreshold}`,
    '',
    '| Threshold | Mean Precision | Total Matches | Total Accurate |',
    '|-----------|----------------|---------------|----------------|',
    ...input.rows.map((row) => `| ${row.threshold} | ${row.meanPrecision} | ${row.totalMatches} | ${row.totalAccurate} |`),
  ].join('\n')
}

interface PowerAnalysisInput {
  primaryMetric: string
  margin: number
  minimumDetectableEffect: number
  clusterCount: number
  eligibleRuns: number
  confidenceLevel: number
}

export function buildBacktestArtifacts(input: {
  aggregatedRows: AggregatedThresholdSweepResult[]
  selectedThreshold: number
  currentProductionThreshold: number
  powerAnalysis: PowerAnalysisInput
}) {
  const selected = input.aggregatedRows.find((row) => row.threshold === input.selectedThreshold) ?? null
  const currentProduction = input.aggregatedRows.find((row) => row.threshold === input.currentProductionThreshold) ?? null

  const asInterval = (row: AggregatedThresholdSweepResult | null) => {
    if (!row) return { mean: 0, lower: 0, upper: 0 }
    return {
      mean: row.meanPrecision,
      lower: row.meanPrecision,
      upper: row.meanPrecision,
    }
  }

  const rolloutReport = buildRolloutReport({
    primaryMetric: input.powerAnalysis.primaryMetric,
    currentProduction: asInterval(currentProduction),
    candidate: asInterval(selected),
    baselines: [
      { name: 'random', mean: 1 / 3, lower: 1 / 3, upper: 1 / 3 },
      { name: 'current production threshold', ...asInterval(currentProduction) },
    ],
  })

  return {
    selected,
    thresholdSummary: renderThresholdSweepSummary({
      selectedThreshold: input.selectedThreshold,
      rows: input.aggregatedRows,
    }),
    rolloutReport,
    powerAnalysisReport: renderPowerAnalysisReport(input.powerAnalysis),
  }
}
