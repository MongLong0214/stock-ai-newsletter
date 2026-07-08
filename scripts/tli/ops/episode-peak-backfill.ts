import { findPrimaryPeakDate, smoothScores7d } from '@/lib/tli/episode-policy'

export type EpisodePeakBackfillNullReason =
  | 'active_episode'
  | 'open_episode'
  | 'existing_peak'
  | 'no_scores_in_episode_window'
  | 'no_smoothed_scores'

export interface EpisodePeakBackfillEpisode {
  readonly id: string
  readonly theme_id: string
  readonly episode_start: string
  readonly episode_end: string | null
  readonly is_active: boolean
  readonly primary_peak_date: string | null
  readonly peak_score: number | null
}

export interface EpisodePeakBackfillScoreRow {
  readonly theme_id: string
  readonly calculated_at: string
  readonly score: number
}

export interface EpisodePeakBackfillPlan {
  readonly episode: EpisodePeakBackfillEpisode
  readonly peakDate: string | null
  readonly peakScore: number | null
  readonly scoreCount: number
  readonly nullReason: EpisodePeakBackfillNullReason | null
}

interface EpisodePeakComputation {
  readonly peakDate: string | null
  readonly peakScore: number | null
  readonly scoreCount: number
  readonly nullReason: EpisodePeakBackfillNullReason | null
}

const toDate = (timestamp: string): string => timestamp.split('T')[0] ?? timestamp

const computeEpisodePeak = (
  scores: readonly EpisodePeakBackfillScoreRow[],
): EpisodePeakComputation => {
  if (scores.length === 0) {
    return {
      peakDate: null,
      peakScore: null,
      scoreCount: 0,
      nullReason: 'no_scores_in_episode_window',
    }
  }

  const smoothed = smoothScores7d(scores.map((row) => ({
    date: toDate(row.calculated_at),
    score: row.score,
  })))
  const peakDate = findPrimaryPeakDate(smoothed)
  if (peakDate === null) {
    return {
      peakDate: null,
      peakScore: null,
      scoreCount: scores.length,
      nullReason: 'no_smoothed_scores',
    }
  }

  return {
    peakDate,
    peakScore: smoothed.find((row) => row.date === peakDate)?.smoothedScore ?? null,
    scoreCount: scores.length,
    nullReason: null,
  }
}

export const buildEpisodePeakBackfillPlan = (input: {
  readonly episodes: readonly EpisodePeakBackfillEpisode[]
  readonly scores: readonly EpisodePeakBackfillScoreRow[]
}): EpisodePeakBackfillPlan[] => {
  const scoresByTheme = new Map<string, EpisodePeakBackfillScoreRow[]>()
  for (const score of input.scores) {
    const rows = scoresByTheme.get(score.theme_id) ?? []
    rows.push(score)
    scoresByTheme.set(score.theme_id, rows)
  }

  return input.episodes.map((episode) => {
    if (episode.is_active) {
      return { episode, peakDate: null, peakScore: null, scoreCount: 0, nullReason: 'active_episode' }
    }
    if (episode.episode_end === null) {
      return { episode, peakDate: null, peakScore: null, scoreCount: 0, nullReason: 'open_episode' }
    }
    if (episode.primary_peak_date !== null) {
      return {
        episode,
        peakDate: episode.primary_peak_date,
        peakScore: episode.peak_score,
        scoreCount: 0,
        nullReason: 'existing_peak',
      }
    }

    const episodeEnd = episode.episode_end
    const scoreRows = (scoresByTheme.get(episode.theme_id) ?? []).filter((score) => {
      const date = toDate(score.calculated_at)
      return date >= episode.episode_start && date <= episodeEnd
    })
    const peak = computeEpisodePeak(scoreRows)
    return {
      episode,
      ...peak,
    }
  })
}
