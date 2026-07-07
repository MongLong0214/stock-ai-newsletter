import { describe, expect, it } from 'vitest'

import {
  buildMethodologyMetricsSummary,
  type ModelMetricsDailyRow,
} from '@/lib/tli/methodology-metrics'

describe('buildMethodologyMetricsSummary', () => {
  it('aggregates champion model metrics over the latest 90 calendar days', () => {
    const rows: ModelMetricsDailyRow[] = [
      makeRow({ metric_date: '2026-04-07', model_version: 'champion', n_scored: 999, brier: 0.01 }),
      makeRow({ metric_date: '2026-07-04', model_version: 'challenger', n_scored: 10, brier: 0.9 }),
      makeRow({
        metric_date: '2026-07-04',
        model_version: 'champion',
        n_scored: 10,
        brier: 0.2,
        ece: 0.1,
        p_at_10: 0.5,
        coverage: 0.8,
        abstain_rate: 0.2,
      }),
      makeRow({
        metric_date: '2026-07-05',
        model_version: 'champion',
        n_scored: 30,
        brier: '0.1',
        ece: '0.05',
        p_at_10: '1',
        coverage: '0.6',
        abstain_rate: '0.4',
      }),
    ]

    const summary = buildMethodologyMetricsSummary({
      rows,
      championModelVersion: 'champion',
      today: '2026-07-06',
    })

    expect(summary.status).toBe('ready')
    expect(summary.sinceDate).toBe('2026-04-08')
    expect(summary.latestMetricDate).toBe('2026-07-05')
    expect(summary.metricDays).toBe(2)
    expect(summary.nScored).toBe(40)
    expect(summary.brier).toBe(0.125)
    expect(summary.ece).toBe(0.0625)
    expect(summary.pAt10).toBe(0.75)
    expect(summary.coverage).toBe(0.7)
    expect(summary.abstainRate).toBe(0.3)
  })

  it('returns an empty summary when the champion has no metrics', () => {
    const summary = buildMethodologyMetricsSummary({
      rows: [makeRow({ metric_date: '2026-07-05', model_version: 'other', n_scored: 12 })],
      championModelVersion: 'champion',
      today: '2026-07-06',
    })

    expect(summary.status).toBe('empty')
    expect(summary.championModelVersion).toBe('champion')
    expect(summary.metricDays).toBe(0)
    expect(summary.pAt10).toBeNull()
  })
})

function makeRow(overrides: Partial<ModelMetricsDailyRow>): ModelMetricsDailyRow {
  return {
    metric_date: '2026-07-01',
    model_version: 'champion',
    brier: null,
    ece: null,
    p_at_10: null,
    coverage: null,
    abstain_rate: null,
    n_scored: 0,
    ...overrides,
  }
}
