import { describe, expect, it } from 'vitest'
import { buildLegacyBridgeRows } from '../level4/legacy-bridge'

describe('level4 legacy bridge', () => {
  it('groups legacy comparisons into v2 run rows and ranked candidate rows', () => {
    const rows = buildLegacyBridgeRows([
      {
        id: 'cmp-1',
        current_theme_id: 'theme-1',
        past_theme_id: 'past-1',
        similarity_score: 0.82,
        current_day: 12,
        past_peak_day: 20,
        past_total_days: 30,
        message: 'a',
        feature_sim: 0.5,
        curve_sim: 0.7,
        keyword_sim: 0.1,
        past_peak_score: 88,
        past_final_stage: 'Decline',
        past_decline_days: 10,
        calculated_at: '2026-03-01',
      },
      {
        id: 'cmp-2',
        current_theme_id: 'theme-1',
        past_theme_id: 'past-2',
        similarity_score: 0.74,
        current_day: 12,
        past_peak_day: 22,
        past_total_days: 35,
        message: 'b',
        feature_sim: 0.4,
        curve_sim: 0.6,
        keyword_sim: 0.1,
        past_peak_score: 80,
        past_final_stage: 'Decline',
        past_decline_days: 13,
        calculated_at: '2026-03-01',
      },
    ])

    expect(rows.runs).toHaveLength(1)
    expect(rows.runs[0].current_theme_id).toBe('theme-1')
    expect(rows.runs[0].run_date).toBe('2026-03-01')
    expect(rows.candidates).toHaveLength(2)
    expect(rows.candidates[0].rank).toBe(1)
    expect(rows.candidates[0].candidate_theme_id).toBe('past-1')
    expect(rows.candidates[1].rank).toBe(2)
  })
})
