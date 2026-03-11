import { describe, expect, it } from 'vitest'
import {
  buildBackfillExecutionPlan,
  normalizeLegacyComparisonForParity,
  remapLegacyRowToV2Candidate,
  buildNullMappingReport,
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

  it('remaps a legacy comparison row to a v2 candidate shape', () => {
    const v2 = remapLegacyRowToV2Candidate({
      runId: 'run-1',
      rank: 1,
      legacy: {
        id: 'cmp-1',
        past_theme_id: 'past-1',
        similarity_score: 0.72,
        current_day: 10,
        past_peak_day: 18,
        past_total_days: 30,
        message: null,
        feature_sim: 0.5,
        curve_sim: null,
        keyword_sim: null,
        past_peak_score: null,
        past_final_stage: null,
        past_decline_days: null,
      },
    })

    expect(v2.run_id).toBe('run-1')
    expect(v2.candidate_theme_id).toBe('past-1')
    expect(v2.rank).toBe(1)
    expect(v2.similarity_score).toBe(0.72)
    expect(v2.message).toBe('')
    expect(v2.curve_sim).toBeNull()
    expect(v2.is_selected_top3).toBe(true)
  })

  it('builds a null/default mapping report', () => {
    const report = buildNullMappingReport([
      {
        run_id: 'r1', candidate_theme_id: 'p1', rank: 1,
        similarity_score: 0.7, feature_sim: 0.5, curve_sim: null, keyword_sim: null,
        current_day: 10, past_peak_day: 18, past_total_days: 30,
        estimated_days_to_peak: 8, message: '', past_peak_score: null,
        past_final_stage: null, past_decline_days: null, is_selected_top3: true,
      },
      {
        run_id: 'r1', candidate_theme_id: 'p2', rank: 2,
        similarity_score: 0.6, feature_sim: 0.4, curve_sim: 0.5, keyword_sim: 0.3,
        current_day: 12, past_peak_day: 20, past_total_days: 35,
        estimated_days_to_peak: 8, message: 'test', past_peak_score: 80,
        past_final_stage: 'Decline', past_decline_days: 10, is_selected_top3: true,
      },
    ])

    expect(report.totalRows).toBe(2)
    expect(report.nullCounts.curve_sim).toBe(1)
    expect(report.nullCounts.keyword_sim).toBe(1)
    expect(report.nullCounts.past_peak_score).toBe(1)
    expect(report.nullCounts.past_final_stage).toBe(1)
    expect(report.nullCounts.past_decline_days).toBe(1)
    expect(report.defaultCounts.message).toBe(1)
  })
})
