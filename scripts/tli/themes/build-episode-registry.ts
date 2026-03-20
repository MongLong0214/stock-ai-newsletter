/**
 * TCAR-006: Build Episode Registry from Theme Lifecycle History
 *
 * Pure functions for converting theme_state_history_v2 transitions into
 * episode_registry_v1 records. No DB calls — composable building blocks.
 */

import type { BoundarySource } from '@/lib/tli/analog/types'
import { createDefaultPolicyVersions } from '@/lib/tli/analog/types'
import {
  classifyEpisodeStart,
  classifyEpisodeEnd,
  detectMultiPeak,
  smoothScores7d,
  findPrimaryPeakDate,
} from '@/lib/tli/episode-policy'
import type { ThemeStateHistoryV2 } from '@/lib/tli/types/db'

export interface DailyScore {
  date: string
  score: number
}

export interface EpisodeCandidate {
  theme_id: string
  episode_number: number
  boundary_source_start: BoundarySource
  boundary_source_end: BoundarySource | null
  episode_start: string
  episode_end: string | null
  is_active: boolean
  multi_peak: boolean
  primary_peak_date: string | null
  peak_score: number | null
  policy_versions: ReturnType<typeof createDefaultPolicyVersions>
}

const INFERRED_END_RECENT_SCORE_DAYS = 14
const INFERRED_END_NOT_SEEN_DAYS = 30
const INFERRED_EPISODE_ACTIVE_THRESHOLD = 15
const INFERRED_EPISODE_DORMANT_GAP_DAYS = 14

const daysBetween = (from: string, to: string): number => {
  const msPerDay = 86400000
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

const filterScoresInRange = (
  scores: DailyScore[],
  start: string,
  end: string | null,
): DailyScore[] =>
  scores.filter((score) => score.date >= start && (end === null || score.date <= end))

const maxScoreInRange = (scores: DailyScore[]): number => {
  if (scores.length === 0) return 0
  return Math.max(...scores.map((score) => score.score))
}

const getRecentScoresEndingOn = (
  scores: DailyScore[],
  referenceDate: string,
  days: number,
): number[] => {
  const end = new Date(referenceDate)
  const start = new Date(referenceDate)
  start.setDate(start.getDate() - (days - 1))
  const startDate = start.toISOString().split('T')[0]
  const endDate = end.toISOString().split('T')[0]

  return scores
    .filter((score) => score.date >= startDate && score.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((score) => score.score)
}

interface Transition {
  date: string
  isActive: boolean
  closedAt: string | null
  effectiveTo: string | null
  stateVersion: string
  history: ThemeStateHistoryV2
}

const parseTransitions = (history: ThemeStateHistoryV2[]): Transition[] => {
  const sorted = [...history].sort((a, b) =>
    a.effective_from.localeCompare(b.effective_from),
  )

  return sorted.map((row) => ({
    date: row.effective_from,
    isActive: row.is_active,
    closedAt: row.closed_at,
    effectiveTo: row.effective_to,
    stateVersion: row.state_version,
    history: row,
  }))
}

export const inferEpisodesFromScores = (
  themeId: string,
  dailyScores: DailyScore[],
  isCurrentlyActive: boolean,
): EpisodeCandidate[] => {
  const sorted = [...dailyScores].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return []

  const segments: Array<{ startIndex: number; endIndex: number; isActive: boolean }> = []
  let currentStartIndex: number | null = null
  let lastActiveIndex: number | null = null
  let dormantStreak = 0

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    if (row.score >= INFERRED_EPISODE_ACTIVE_THRESHOLD) {
      if (currentStartIndex === null) {
        currentStartIndex = i
      }
      lastActiveIndex = i
      dormantStreak = 0
      continue
    }

    if (currentStartIndex === null) continue
    dormantStreak += 1
    if (dormantStreak >= INFERRED_EPISODE_DORMANT_GAP_DAYS && lastActiveIndex !== null) {
      segments.push({
        startIndex: currentStartIndex,
        endIndex: lastActiveIndex,
        isActive: false,
      })
      currentStartIndex = null
      lastActiveIndex = null
      dormantStreak = 0
    }
  }

  if (currentStartIndex !== null && lastActiveIndex !== null) {
    segments.push({
      startIndex: currentStartIndex,
      endIndex: lastActiveIndex,
      isActive: isCurrentlyActive,
    })
  }

  return segments.map((segment, index) => {
    const segmentScores = sorted.slice(segment.startIndex, segment.endIndex + 1)
    const smoothed = smoothScores7d(segmentScores)
    const peakDate = findPrimaryPeakDate(smoothed)
    const peakScore = smoothed.length > 0
      ? Math.max(...smoothed.map((score) => score.smoothedScore))
      : null

    return {
      theme_id: themeId,
      episode_number: index + 1,
      boundary_source_start: 'inferred-v1' as const,
      boundary_source_end: segment.isActive ? null : 'inferred-v1',
      episode_start: segmentScores[0].date,
      episode_end: segment.isActive ? null : segmentScores[segmentScores.length - 1].date,
      is_active: segment.isActive,
      multi_peak: false,
      primary_peak_date: peakDate,
      peak_score: peakScore,
      policy_versions: createDefaultPolicyVersions(),
    }
  })
}

export const buildEpisodesFromHistory = (
  themeId: string,
  history: ThemeStateHistoryV2[],
  dailyScores: DailyScore[],
): EpisodeCandidate[] => {
  if (history.length === 0) return []

  const transitions = parseTransitions(history)
  const episodes: EpisodeCandidate[] = []

  let currentEpisode: {
    startDate: string
    startSource: BoundarySource
    endDate: string | null
    endSource: BoundarySource | null
    isActive: boolean
    multiPeak: boolean
    episodeMaxScore: number
  } | null = null

  let episodeNumber = 0

  for (let i = 0; i < transitions.length; i++) {
    const transition = transitions[i]
    const nextTransitionDate = i + 1 < transitions.length ? transitions[i + 1].date : null

    if (transition.isActive) {
      if (currentEpisode === null) {
        episodeNumber++
        const { source } = classifyEpisodeStart(transition.history)
        currentEpisode = {
          startDate: transition.date,
          startSource: source,
          endDate: null,
          endSource: null,
          isActive: true,
          multiPeak: false,
          episodeMaxScore: maxScoreInRange(
            filterScoresInRange(dailyScores, transition.date, nextTransitionDate),
          ),
        }
        continue
      }

      const lastEnd = currentEpisode.endDate
      if (lastEnd === null) {
        const activeScores = filterScoresInRange(dailyScores, transition.date, nextTransitionDate)
        const activeMax = maxScoreInRange(activeScores)
        if (activeMax > currentEpisode.episodeMaxScore) {
          currentEpisode.episodeMaxScore = activeMax
        }
        continue
      }

      const gapDays = daysBetween(lastEnd, transition.date)
      const reactivationScores = filterScoresInRange(dailyScores, transition.date, nextTransitionDate)
      const reactivationMax = maxScoreInRange(reactivationScores)

      const { isMultiPeak, isNewEpisode } = detectMultiPeak({
        localMaxScore: reactivationMax,
        episodeMaxScore: currentEpisode.episodeMaxScore,
        dormantGapDays: gapDays,
      })

      if (isNewEpisode) {
        const previousScores = filterScoresInRange(
          dailyScores,
          currentEpisode.startDate,
          currentEpisode.endDate,
        )
        const smoothed = smoothScores7d(previousScores)
        const peakDate = findPrimaryPeakDate(smoothed)
        const peakScore = smoothed.length > 0
          ? Math.max(...smoothed.map((score) => score.smoothedScore))
          : null

        episodes.push({
          theme_id: themeId,
          episode_number: episodeNumber,
          boundary_source_start: currentEpisode.startSource,
          boundary_source_end: currentEpisode.endSource,
          episode_start: currentEpisode.startDate,
          episode_end: currentEpisode.endDate,
          is_active: false,
          multi_peak: currentEpisode.multiPeak,
          primary_peak_date: peakDate,
          peak_score: peakScore,
          policy_versions: createDefaultPolicyVersions(),
        })

        episodeNumber++
        const { source } = classifyEpisodeStart(transition.history)
        currentEpisode = {
          startDate: transition.date,
          startSource: source,
          endDate: null,
          endSource: null,
          isActive: true,
          multiPeak: false,
          episodeMaxScore: reactivationMax,
        }
      } else {
        currentEpisode.endDate = null
        currentEpisode.endSource = null
        currentEpisode.isActive = true

        if (isMultiPeak) {
          currentEpisode.multiPeak = true
        }

        currentEpisode.episodeMaxScore = Math.max(
          currentEpisode.episodeMaxScore,
          reactivationMax,
        )
      }

      continue
    }

    if (currentEpisode === null) {
      const { source: startSource } = classifyEpisodeStart(transition.history)
      if (startSource === 'imported' || transition.stateVersion === 'backfill-v1') {
        episodeNumber++
        const endDate = transition.closedAt ?? transition.effectiveTo ?? transition.date
        const endSource: BoundarySource = transition.closedAt
          ? 'observed'
          : (transition.effectiveTo ? 'observed' : 'imported')
        const episodeScores = filterScoresInRange(dailyScores, transition.date, endDate)
        const smoothed = smoothScores7d(episodeScores)
        const peakDate = findPrimaryPeakDate(smoothed)
        const peakScore = smoothed.length > 0
          ? Math.max(...smoothed.map((score) => score.smoothedScore))
          : null

        episodes.push({
          theme_id: themeId,
          episode_number: episodeNumber,
          boundary_source_start: startSource,
          boundary_source_end: endSource,
          episode_start: transition.date,
          episode_end: endDate,
          is_active: false,
          multi_peak: false,
          primary_peak_date: peakDate,
          peak_score: peakScore,
          policy_versions: createDefaultPolicyVersions(),
        })
      }
      continue
    }

    const recentScores = getRecentScoresEndingOn(
      dailyScores,
      transition.date,
      INFERRED_END_RECENT_SCORE_DAYS,
    )
    const hasObservedEnd = Boolean(transition.closedAt || transition.effectiveTo)
    const { date: endDate, source: endSource } = classifyEpisodeEnd({
      notSeenDays: hasObservedEnd ? 0 : INFERRED_END_NOT_SEEN_DAYS,
      recentScores,
      closedAt: transition.closedAt ?? undefined,
      effectiveTo: transition.effectiveTo ?? undefined,
      referenceDate: transition.date,
    })

    currentEpisode.endDate = endDate ?? transition.date
    currentEpisode.endSource = endSource ?? 'observed'
    currentEpisode.isActive = false

    const episodeScores = filterScoresInRange(
      dailyScores,
      currentEpisode.startDate,
      currentEpisode.endDate,
    )
    currentEpisode.episodeMaxScore = Math.max(
      currentEpisode.episodeMaxScore,
      maxScoreInRange(episodeScores),
    )
  }

  if (currentEpisode !== null) {
    const endDate = currentEpisode.isActive ? null : currentEpisode.endDate
    const episodeScores = filterScoresInRange(
      dailyScores,
      currentEpisode.startDate,
      endDate,
    )
    const smoothed = smoothScores7d(episodeScores)
    const peakDate = findPrimaryPeakDate(smoothed)
    const peakScore = smoothed.length > 0
      ? Math.max(...smoothed.map((score) => score.smoothedScore))
      : null

    episodes.push({
      theme_id: themeId,
      episode_number: episodeNumber,
      boundary_source_start: currentEpisode.startSource,
      boundary_source_end: currentEpisode.isActive ? null : currentEpisode.endSource,
      episode_start: currentEpisode.startDate,
      episode_end: endDate,
      is_active: currentEpisode.isActive,
      multi_peak: currentEpisode.multiPeak,
      primary_peak_date: peakDate,
      peak_score: peakScore,
      policy_versions: createDefaultPolicyVersions(),
    })
  }

  return episodes
}
