import { existsSync } from 'node:fs'
import { buildRolloutReport } from './comparison-v4-replay'

// ── PRD §9: baseline definitions ──

export const BASELINE_DEFINITIONS = [
  { id: 'random', name: 'Random Baseline' },
  { id: 'sector-only', name: 'Sector-Only Baseline' },
  { id: 'feature-only', name: 'Feature-Only Baseline' },
  { id: 'curve-only', name: 'Curve-Only Baseline' },
  { id: 'current-production', name: 'Current Production' },
  { id: 'top3-without-threshold', name: 'Top-3 Without Threshold' },
] as const

// ── Baseline pass/fail ──

export const evaluateBaselinePassFail = (input: {
  candidateMean: number
  baselines: Array<{ id: string; mean: number }>
  minimumBeatBaseline: string
}): { passed: boolean; failedBaselines: string[] } => {
  const failedBaselines = input.baselines
    .filter((b) => input.candidateMean <= b.mean)
    .map((b) => b.id)

  const passed = !failedBaselines.includes(input.minimumBeatBaseline)
  return { passed, failedBaselines }
}

// ── Power analysis document guard ──

export const requirePowerAnalysisDocument = (
  path: string,
): { exists: boolean } => ({
  exists: existsSync(path),
})

// ── PRD §8.3: minimum test cohort enforcement ──

export const MIN_ELIGIBLE_RUNS = 100
export const MIN_UNIQUE_THEMES = 30

export const evaluateMinimumTestCohort = (input: {
  eligibleRuns: number
  uniqueThemes: number
}): { sufficient: boolean; failures: string[] } => {
  const failures: string[] = []
  if (input.eligibleRuns < MIN_ELIGIBLE_RUNS) failures.push('eligible_runs')
  if (input.uniqueThemes < MIN_UNIQUE_THEMES) failures.push('unique_themes')
  return { sufficient: failures.length === 0, failures }
}

// ── Rollout report with fold variance ──

interface IntervalSummary {
  mean: number
  lower: number
  upper: number
}

interface BaselineSummary extends IntervalSummary {
  name: string
}

export const buildRolloutReportWithVariance = (input: {
  primaryMetric: string
  foldResults: Array<{ foldId: string; precision: number }>
  currentProduction: IntervalSummary
  baselines: BaselineSummary[]
}): string => {
  const precisions = input.foldResults.map((f) => f.precision)
  const mean = precisions.length > 0
    ? precisions.reduce((sum, v) => sum + v, 0) / precisions.length
    : 0
  const variance = precisions.length > 1
    ? precisions.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (precisions.length - 1)
    : 0
  const stddev = Math.sqrt(variance)

  const foldLines = input.foldResults.map(
    (f) => `| ${f.foldId} | ${f.precision} |`,
  )

  const baseReport = buildRolloutReport({
    primaryMetric: input.primaryMetric,
    currentProduction: input.currentProduction,
    candidate: { mean, lower: mean - stddev, upper: mean + stddev },
    baselines: input.baselines,
  })

  return [
    baseReport,
    '',
    '## Fold Results',
    '',
    '| Fold | Precision |',
    '|------|-----------|',
    ...foldLines,
    '',
    `Mean: ${mean}`,
    `Std Dev: ${stddev}`,
  ].join('\n')
}
