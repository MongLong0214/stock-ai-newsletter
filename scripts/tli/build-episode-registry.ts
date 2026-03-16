/**
 * TCAR-006: Build Episode Registry from Theme Lifecycle History
 *
 * Pure functions for converting theme_state_history_v2 transitions into
 * episode_registry_v1 records. No DB calls — composable building blocks.
 *
 * Episode boundary classification uses TCAR-005 (episode-policy.ts).
 * Bridge schema types from TCAR-002 (bridge-schema.ts).
 */

import type { BoundarySource } from '../../lib/tli/analog/types'
import { createDefaultPolicyVersions } from '../../lib/tli/analog/types'
import {
  classifyEpisodeStart,
  classifyEpisodeEnd,
  detectMultiPeak,
  smoothScores7d,
  findPrimaryPeakDate,
} from '../../lib/tli/episode-policy'
import type { ThemeStateHistoryV2 } from '../../lib/tli/types/db'

// --- Types ---

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

// --- Constants ---

const INFERRED_END_RECENT_SCORE_DAYS = 14
const INFERRED_END_NOT_SEEN_DAYS = 30

// --- Helpers ---

const daysBetween = (from: string, to: string): number => {
  const msPerDay = 86400000
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

const filterScoresInRange = (
  scores: DailyScore[],
  start: string,
  end: string | null,
): DailyScore[] =>
  scores.filter(s => s.date >= start && (end === null || s.date <= end))

const maxScoreInRange = (scores: DailyScore[]): number => {
  if (scores.length === 0) return 0
  return Math.max(...scores.map(s => s.score))
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

// --- Internal transition parsing ---

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

  return sorted.map(h => ({
    date: h.effective_from,
    isActive: h.is_active,
    closedAt: h.closed_at,
    effectiveTo: h.effective_to,
    stateVersion: h.state_version,
    history: h,
  }))
}

// --- Core builder ---

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
    const t = transitions[i]
    // Next transition date bounds the score range (point-in-time safety)
    const nextTransitionDate = i + 1 < transitions.length ? transitions[i + 1].date : null

    if (t.isActive) {
      // Activation transition
      if (currentEpisode === null) {
        // First activation → new episode
        episodeNumber++
        const { source } = classifyEpisodeStart(t.history)
        currentEpisode = {
          startDate: t.date,
          startSource: source,
          endDate: null,
          endSource: null,
          isActive: true,
          multiPeak: false,
          episodeMaxScore: maxScoreInRange(
            filterScoresInRange(dailyScores, t.date, nextTransitionDate),
          ),
        }
      } else {

        // Reactivation — check dormant gap
        const lastEnd = currentEpisode.endDate
        if (lastEnd === null) {
          // Already active — update episodeMaxScore with current transition's scores
          const activeScores = filterScoresInRange(dailyScores, t.date, nextTransitionDate)
          const activeMax = maxScoreInRange(activeScores)
          if (activeMax > currentEpisode.episodeMaxScore) {
            currentEpisode.episodeMaxScore = activeMax
          }
          continue
        }

        const gapDays = daysBetween(lastEnd, t.date)

        // Get max score during this reactivation period (bounded by next transition)
        const reactivationScores = filterScoresInRange(dailyScores, t.date, nextTransitionDate)
        const reactivationMax = maxScoreInRange(reactivationScores)

        const { isMultiPeak, isNewEpisode } = detectMultiPeak({
          localMaxScore: reactivationMax,
          episodeMaxScore: currentEpisode.episodeMaxScore,
          dormantGapDays: gapDays,
        })

        if (isNewEpisode) {
          // Finalize previous episode and start new one
          const prevScores = filterScoresInRange(
            dailyScores,
            currentEpisode.startDate,
            currentEpisode.endDate,
          )
          const smoothed = smoothScores7d(prevScores)
          const peakDate = findPrimaryPeakDate(smoothed)
          const peakScore = smoothed.length > 0
            ? Math.max(...smoothed.map(s => s.smoothedScore))
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

          // Start new episode
          episodeNumber++
          const { source } = classifyEpisodeStart(t.history)
          currentEpisode = {
            startDate: t.date,
            startSource: source,
            endDate: null,
            endSource: null,
            isActive: true,
            multiPeak: false,
            episodeMaxScore: reactivationMax,
          }
        } else {
          // Same episode — reopen it
          currentEpisode.endDate = null
          currentEpisode.endSource = null
          currentEpisode.isActive = true

          if (isMultiPeak) {
            currentEpisode.multiPeak = true
          }

          // Update episode max score
          currentEpisode.episodeMaxScore = Math.max(
            currentEpisode.episodeMaxScore,
            reactivationMax,
          )
        }
      }
    } else {
      // Deactivation transition
      if (currentEpisode === null) {
        // Imported episode: backfill-v1 inactive with no prior activation
        const { source: startSource } = classifyEpisodeStart(t.history)
        if (startSource === 'imported' || t.stateVersion === 'backfill-v1') {
          episodeNumber++
          const endDate = t.closedAt ?? t.effectiveTo ?? t.date
          const endSource: BoundarySource = t.closedAt ? 'observed' : (t.effectiveTo ? 'observed' : 'imported')
          const episodeScores = filterScoresInRange(dailyScores, t.date, endDate)
          const smoothed = smoothScores7d(episodeScores)
          const peakDate = findPrimaryPeakDate(smoothed)
          const peakScore = smoothed.length > 0
            ? Math.max(...smoothed.map(s => s.smoothedScore))
            : null

          episodes.push({
            theme_id: themeId,
            episode_number: episodeNumber,
            boundary_source_start: startSource,
            boundary_source_end: endSource,
            episode_start: t.date,
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
        t.date,
        INFERRED_END_RECENT_SCORE_DAYS,
      )
      const hasObservedEnd = Boolean(t.closedAt || t.effectiveTo)
      const { date: endDate, source: endSource } = classifyEpisodeEnd({
        notSeenDays: hasObservedEnd ? 0 : INFERRED_END_NOT_SEEN_DAYS,
        recentScores,
        closedAt: t.closedAt ?? undefined,
        effectiveTo: t.effectiveTo ?? undefined,
        referenceDate: t.date,
      })

      currentEpisode.endDate = endDate ?? t.date
      currentEpisode.endSource = endSource ?? 'observed'
      currentEpisode.isActive = false

      // Update episode max score with the full range
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
  }

  // Finalize any open episode
  if (currentEpisode !== null) {
    const endDate = currentEpisode.isActive ? null : currentEpisode.endDate
    const scoresEnd = endDate ?? undefined
    const episodeScores = filterScoresInRange(
      dailyScores,
      currentEpisode.startDate,
      scoresEnd ?? null,
    )
    const smoothed = smoothScores7d(episodeScores)
    const peakDate = findPrimaryPeakDate(smoothed)
    const peakScore = smoothed.length > 0
      ? Math.max(...smoothed.map(s => s.smoothedScore))
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
