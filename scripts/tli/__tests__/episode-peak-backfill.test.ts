import { describe, expect, it } from 'vitest'
import {
  buildEpisodePeakBackfillPlan,
  type EpisodePeakBackfillEpisode,
  type EpisodePeakBackfillScoreRow,
} from '@/scripts/tli/ops/episode-peak-backfill'

const makeEpisode = (
  overrides: Partial<EpisodePeakBackfillEpisode>,
): EpisodePeakBackfillEpisode => ({
  id: overrides.id ?? 'episode-1',
  theme_id: overrides.theme_id ?? 'theme-1',
  episode_start: overrides.episode_start ?? '2026-01-01',
  episode_end: overrides.episode_end ?? '2026-01-05',
  is_active: overrides.is_active ?? false,
  primary_peak_date: overrides.primary_peak_date ?? null,
  peak_score: overrides.peak_score ?? null,
})

const makeScore = (date: string, score: number): EpisodePeakBackfillScoreRow => ({
  theme_id: 'theme-1',
  calculated_at: `${date}T00:00:00.000Z`,
  score,
})

describe('buildEpisodePeakBackfillPlan', () => {
  it('computes a primary peak for completed null-peak episodes with score rows', () => {
    // Given: a completed episode has no stored peak but has lifecycle scores in its episode window.
    const episodes = [makeEpisode({})]
    const scores = [
      makeScore('2026-01-01', 10),
      makeScore('2026-01-02', 30),
      makeScore('2026-01-03', 50),
      makeScore('2026-01-04', 40),
      makeScore('2026-01-05', 20),
    ]

    // When: the ops planner recomputes episode peaks.
    const [plan] = buildEpisodePeakBackfillPlan({ episodes, scores })

    // Then: it produces a non-null peak using the shared smoothing policy.
    expect(plan).toMatchObject({
      peakDate: '2026-01-04',
      peakScore: 32.5,
      scoreCount: 5,
      nullReason: null,
    })
  })

  it('keeps a null peak intentional when the completed episode has no score rows', () => {
    // Given: a completed episode has no lifecycle scores in its episode window.
    const episodes = [makeEpisode({})]

    // When: the ops planner recomputes episode peaks.
    const [plan] = buildEpisodePeakBackfillPlan({ episodes, scores: [] })

    // Then: it keeps the peak null with an explicit reason for the summary.
    expect(plan).toMatchObject({
      peakDate: null,
      peakScore: null,
      scoreCount: 0,
      nullReason: 'no_scores_in_episode_window',
    })
  })
})
