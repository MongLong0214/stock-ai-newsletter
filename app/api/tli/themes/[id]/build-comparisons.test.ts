import { describe, expect, it, vi } from 'vitest'
import { buildComparisonResultFromV2Candidate, type V2CandidateForBuild } from './build-comparisons'

// mock supabase for the existing buildComparisonResults function
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}))

describe('build-comparisons v2 support', () => {
  it('builds a ComparisonResult from a v2 candidate row', () => {
    const candidate: V2CandidateForBuild = {
      candidate_theme_id: 'past-1',
      similarity_score: 0.72,
      current_day: 10,
      past_peak_day: 18,
      past_total_days: 30,
      estimated_days_to_peak: 8,
      message: 'test message',
      feature_sim: 0.5,
      curve_sim: 0.7,
      keyword_sim: 0.1,
      past_peak_score: 82,
      past_final_stage: 'Decline',
      past_decline_days: 10,
    }

    const result = buildComparisonResultFromV2Candidate(candidate, {
      pastThemeName: '과거 테마',
      lifecycleCurve: [{ date: '2026-01-01', score: 50 }],
    })

    expect(result.pastTheme).toBe('과거 테마')
    expect(result.pastThemeId).toBe('past-1')
    expect(result.similarity).toBe(0.72)
    expect(result.estimatedDaysToPeak).toBe(8)
    expect(result.lifecycleCurve).toEqual([{ date: '2026-01-01', score: 50 }])
    expect(result.featureSim).toBe(0.5)
    expect(result.pastPeakScore).toBe(82)
    expect(result.pastDeclineDays).toBe(10)
  })

  it('caps values at 365 for safety', () => {
    const candidate: V2CandidateForBuild = {
      candidate_theme_id: 'past-1',
      similarity_score: 0.72,
      current_day: 400,
      past_peak_day: 500,
      past_total_days: 600,
      estimated_days_to_peak: 100,
      message: '',
      feature_sim: null,
      curve_sim: null,
      keyword_sim: null,
      past_peak_score: null,
      past_final_stage: null,
      past_decline_days: null,
    }

    const result = buildComparisonResultFromV2Candidate(candidate, {
      pastThemeName: 'Unknown',
      lifecycleCurve: [],
    })

    expect(result.currentDay).toBe(365)
    expect(result.pastTotalDays).toBe(365)
    expect(result.pastPeakDay).toBeLessThanOrEqual(result.pastTotalDays)
  })
})
