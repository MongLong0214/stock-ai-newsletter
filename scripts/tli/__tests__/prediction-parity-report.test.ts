import { describe, expect, it } from 'vitest'
import {
  buildPredictionParityReport,
  countBusinessDaysAfter,
  type PredictionParityLivePrediction,
  type PredictionParityItem,
} from '@/scripts/tli/comparison/prediction-parity-report'

const livePrediction: PredictionParityLivePrediction = {
  phase: 'rising',
  confidence: 'medium',
  riskLevel: 'low',
  avgPeakDay: 30,
  avgTotalDays: 60,
  avgDaysToPeak: 8,
  daysSinceSpike: 22,
}

const matchingItem: PredictionParityItem = {
  snapshot: {
    id: 'snapshot-1',
    theme_id: 'theme-1',
    snapshot_date: '2026-03-20',
    comparison_run_id: 'run-1',
    phase: 'rising',
    confidence: 'medium',
    risk_level: 'low',
    avg_peak_day: 30,
    avg_total_days: 60,
    avg_days_to_peak: 8,
    days_since_spike: 22,
  },
  livePrediction,
}

describe('buildPredictionParityReport', () => {
  it('reports coverage, parity, and business-day freshness', () => {
    const report = buildPredictionParityReport({
      asOfDate: '2026-03-24',
      windowDays: 14,
      items: [
        matchingItem,
        {
          ...matchingItem,
          snapshot: { ...matchingItem.snapshot, id: 'snapshot-2', theme_id: 'theme-2' },
          livePrediction: null,
        },
      ],
    })

    expect(report.windowDays).toBe(14)
    expect(report.coverageRate).toBe(0.5)
    expect(report.parityRate).toBe(1)
    expect(report.freshnessBusinessDays).toBe(2)
    expect(report.mismatches).toEqual([
      {
        snapshotId: 'snapshot-2',
        themeId: 'theme-2',
        snapshotDate: '2026-03-20',
        fields: ['missing_live_recalculation'],
      },
    ])
  })

  it('classifies items with no snapshot-time-matched historical score as score_missing and excludes them from parity rate', () => {
    // Given: a theme's score changed after the snapshot was taken, and no historical score
    // exists within tolerance of the snapshot date (loader could not compare against the
    // past score that was actually live at snapshot time).
    const report = buildPredictionParityReport({
      asOfDate: '2026-03-24',
      windowDays: 14,
      items: [
        matchingItem,
        {
          ...matchingItem,
          snapshot: { ...matchingItem.snapshot, id: 'snapshot-3', theme_id: 'theme-3' },
          livePrediction: null,
          scoreMissing: true,
        },
      ],
    })

    // Then: score_missing is a distinct reason from missing_live_recalculation, and is
    // excluded from both the recalculated and matched denominators (not counted as a false mismatch).
    expect(report.coverageRate).toBe(0.5)
    expect(report.parityRate).toBe(1)
    expect(report.mismatches).toEqual([
      {
        snapshotId: 'snapshot-3',
        themeId: 'theme-3',
        snapshotDate: '2026-03-20',
        fields: ['score_missing'],
      },
    ])
  })

  it('reports field-level parity mismatches', () => {
    const report = buildPredictionParityReport({
      asOfDate: '2026-03-20',
      windowDays: 14,
      items: [
        {
          ...matchingItem,
          livePrediction: { ...livePrediction, phase: 'cooling', avgPeakDay: 31 },
        },
      ],
    })

    expect(report.coverageRate).toBe(1)
    expect(report.parityRate).toBe(0)
    expect(report.mismatches[0]?.fields).toEqual(['phase', 'avgPeakDay'])
  })
})

describe('countBusinessDaysAfter', () => {
  it('counts Korean trading days after the latest snapshot date', () => {
    expect(countBusinessDaysAfter({ fromDate: '2026-03-20', toDate: '2026-03-24' })).toBe(2)
  })
})
