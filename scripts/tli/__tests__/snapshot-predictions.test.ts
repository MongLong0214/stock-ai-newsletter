import { describe, expect, it } from 'vitest'
import { resolvePredictionInputContext } from '@/scripts/tli/comparison/snapshot-predictions'

describe('snapshot-predictions v4-only input resolution', () => {
  it('uses only v4 shadow candidates and does not fall back to legacy comparisons', () => {
    const result = resolvePredictionInputContext({
      shadowRun: { runId: 'run-1', candidatePool: 'archetype' },
      shadowCandidates: [
        {
          run_id: 'run-1',
          candidate_theme_id: 'past-1',
          rank: 1,
          similarity_score: 0.72,
          feature_sim: 0.5,
          curve_sim: 0.6,
          keyword_sim: 0.1,
          current_day: 12,
          past_peak_day: 20,
          past_total_days: 35,
          estimated_days_to_peak: 8,
          message: 'sample',
          past_peak_score: 82,
          past_final_stage: 'Decline',
          past_decline_days: 9,
          is_selected_top3: true,
        },
      ],
      pastThemeNames: new Map([['past-1', 'Past Theme']]),
    })

    expect(result).not.toBeNull()
    expect(result?.candidatePool).toBe('archetype')
    expect(result?.inputs).toEqual([
      {
        pastTheme: 'Past Theme',
        similarity: 0.72,
        estimatedDaysToPeak: 8,
        pastPeakDay: 20,
        pastTotalDays: 35,
      },
    ])
  })

  it('returns null when there is no v4 run or no v4 candidates', () => {
    expect(resolvePredictionInputContext({
      shadowRun: null,
      shadowCandidates: [],
      pastThemeNames: new Map(),
    })).toBeNull()

    expect(resolvePredictionInputContext({
      shadowRun: { runId: 'run-1', candidatePool: 'archetype' },
      shadowCandidates: [],
      pastThemeNames: new Map(),
    })).toBeNull()
  })
})
