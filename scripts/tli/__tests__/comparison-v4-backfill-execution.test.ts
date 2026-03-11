import { describe, expect, it } from 'vitest'
import {
  buildBackfillExecutionPlan,
  normalizeLegacyComparisonForParity,
} from '../comparison-v4-backfill'

describe('comparison v4 backfill execution helpers', () => {
  it('builds a deterministic execution plan with sample size', () => {
    const plan = buildBackfillExecutionPlan({
      sourceTable: 'theme_comparisons',
      sourceRowCount: 2500,
    })

    expect(plan.sourceTable).toBe('theme_comparisons')
    expect(plan.sampleSize).toBe(125)
  })

  it('normalizes legacy comparison rows for parity checks', () => {
    const normalized = normalizeLegacyComparisonForParity({
      id: 'cmp-1',
      past_theme_id: 'past-1',
      similarity_score: 0.7,
      current_day: 12,
      past_peak_day: 20,
      past_total_days: 35,
      message: 'sample',
      feature_sim: 0.5,
      curve_sim: 0.6,
      keyword_sim: 0.1,
      past_peak_score: 80,
      past_final_stage: 'Decline',
      past_decline_days: 10,
    })

    expect(normalized.past_theme_id).toBe('past-1')
    expect(normalized.similarity_score).toBe(0.7)
    expect(normalized.past_decline_days).toBe(10)
  })
})
