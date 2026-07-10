import { describe, expect, it } from 'vitest'
import type { PredictionParityReport } from '../comparison/prediction-parity-report'
import {
  SCIENTIFIC_GATE_EXIT,
  classifyPredictionParitySeverity,
  classifyThemeWatchlistSeverity,
  scientificGateExitCode,
} from '../ops/scientific-gate-exit'
import {
  THEME_WATCHLIST_REPORT_VERSION,
  type ThemeWatchlistReport,
  type ThemeWatchlistShadowHealth,
} from '../ops/theme-watchlist-report'

const parityReport = (overrides: Partial<PredictionParityReport> = {}): PredictionParityReport => ({
  asOfDate: '2026-07-10',
  windowDays: 14,
  snapshotCount: 40,
  recalculatedCount: 40,
  matchedCount: 40,
  coverageRate: 1,
  parityRate: 1,
  freshnessBusinessDays: 1,
  mismatches: [],
  ...overrides,
})

const watchlistReport = (health: Partial<ThemeWatchlistShadowHealth> = {}): ThemeWatchlistReport => ({
  reportVersion: THEME_WATCHLIST_REPORT_VERSION,
  date: '2026-07-10',
  modelVersion: 'm1-2026w28-a2',
  modelVersionSource: 'registry',
  rising: [],
  cooling: [],
  shadowHealth: {
    totalRows: 40,
    nonNullPRiseCount: 40,
    coverage: 1,
    abstainCount: 0,
    latestScoredDay: { date: '2026-07-09', nScored: 40, brier: 0.2, ece: 0.05 },
    scoredMetricStatus: 'available',
    ...health,
  },
})

describe('scientificGateExitCode', () => {
  it('maps severity to the documented exit codes', () => {
    expect(scientificGateExitCode('pass')).toBe(SCIENTIFIC_GATE_EXIT.pass)
    expect(scientificGateExitCode('warning')).toBe(SCIENTIFIC_GATE_EXIT.warning)
    expect(scientificGateExitCode('critical')).toBe(SCIENTIFIC_GATE_EXIT.criticalContractFailure)
  })

  it('reserves a distinct code for operational failures', () => {
    expect(SCIENTIFIC_GATE_EXIT.operationalFailure).toBe(1)
    expect(SCIENTIFIC_GATE_EXIT.criticalContractFailure).toBe(3)
  })
})

describe('classifyPredictionParitySeverity', () => {
  it('passes when recomputation fully matches fresh snapshots', () => {
    expect(classifyPredictionParitySeverity(parityReport())).toBe('pass')
  })

  it('is critical when comparable snapshots disagree with recomputation', () => {
    expect(classifyPredictionParitySeverity(parityReport({ parityRate: 0.98 }))).toBe('critical')
  })

  it('is critical on nonfinite rates', () => {
    expect(classifyPredictionParitySeverity(parityReport({ parityRate: Number.NaN }))).toBe('critical')
  })

  it('warns instead of failing when there is nothing to compare', () => {
    expect(classifyPredictionParitySeverity(parityReport({ coverageRate: 0, parityRate: 0 }))).toBe('warning')
  })

  it('warns on partial coverage or stale snapshots', () => {
    expect(classifyPredictionParitySeverity(parityReport({ coverageRate: 0.9 }))).toBe('warning')
    expect(classifyPredictionParitySeverity(parityReport({ freshnessBusinessDays: 3 }))).toBe('warning')
  })
})

describe('classifyThemeWatchlistSeverity', () => {
  it('passes on a healthy shadow lane', () => {
    expect(classifyThemeWatchlistSeverity(watchlistReport())).toBe('pass')
  })

  it('is critical when rows exist but no probability was served', () => {
    expect(classifyThemeWatchlistSeverity(watchlistReport({ nonNullPRiseCount: 0, coverage: 0 }))).toBe('critical')
  })

  it('warns when there are no prediction rows yet', () => {
    expect(classifyThemeWatchlistSeverity(watchlistReport({ totalRows: 0, nonNullPRiseCount: 0, coverage: 0 }))).toBe('warning')
  })

  it('warns while scored metrics are still unavailable', () => {
    expect(classifyThemeWatchlistSeverity(watchlistReport({
      latestScoredDay: null,
      scoredMetricStatus: 'no_scored_rows_yet',
    }))).toBe('warning')
  })

  it('treats partial abstention as a pass, not a failure', () => {
    expect(classifyThemeWatchlistSeverity(watchlistReport({
      nonNullPRiseCount: 30,
      coverage: 0.75,
      abstainCount: 10,
    }))).toBe('pass')
  })
})
