/**
 * TCAR-005: Freeze Executable Label Policy and Audit Validators
 *
 * Episode boundary classification, multi-peak detection, score smoothing,
 * and label audit validation for the analog retrieval pipeline.
 */

import type { BoundarySource } from './analog/types'
import type { ThemeStateHistoryV2 } from './types/db'
import { GATE_THRESHOLDS } from './forecast/types'

// --- Types ---

export interface EpisodeForAudit {
  episode_id: string
  theme_id: string
  boundary_source_start: BoundarySource
  boundary_source_end: BoundarySource | null
  episode_start: string
  episode_end: string | null
  is_active: boolean
  is_completed: boolean
  priority_slice?: string
}

export interface LabelAuditResult {
  passed: boolean
  checks: {
    overlappingEpisodes: { passed: boolean; count: number }
    inferredBoundaryOverall: { passed: boolean; ratio: number; threshold: number }
    inferredBoundarySlice: { passed: boolean; worstSlice: string | null; ratio: number; threshold: number }
    rightCensoredAsNegatives: { passed: boolean; count: number }
    futureInformedBoundaryChanges: { passed: boolean; count: number }
  }
}

// --- Constants ---

const INFERRED_NOT_SEEN_DAYS_THRESHOLD = 30
const INFERRED_SCORE_THRESHOLD = 15
const INFERRED_MIN_RECENT_SCORES = 14
const MULTI_PEAK_TOLERANCE_PCT = 5
const DORMANT_GAP_REIGNITION_DAYS = 14
const SMOOTHING_WINDOW = 7

// --- Episode Start Classification ---

export const classifyEpisodeStart = (
  history: ThemeStateHistoryV2,
): { date: string; source: BoundarySource } => {
  const date = history.effective_from

  // backfill-v1 with inactive + no closed_at → imported
  if (history.state_version === 'backfill-v1' && !history.is_active && !history.closed_at) {
    return { date, source: 'imported' }
  }

  // live-v1 or backfill-v1 with observed data → observed
  return { date, source: 'observed' }
}

// --- Episode End Classification ---

export const classifyEpisodeEnd = (params: {
  notSeenDays: number
  recentScores: number[]
  closedAt?: string
  effectiveTo?: string
  referenceDate?: string
}): { date: string | null; source: BoundarySource | null } => {
  // Observed end takes priority (PRD §10.2: closed_at or effective_to)
  if (params.closedAt) {
    return { date: params.closedAt, source: 'observed' }
  }
  if (params.effectiveTo) {
    return { date: params.effectiveTo, source: 'observed' }
  }

  // Inferred-v1: notSeenDays >= 30 AND all recent 14d scores < 15
  // Require at least some score data to prevent vacuous inference
  if (
    params.notSeenDays >= INFERRED_NOT_SEEN_DAYS_THRESHOLD
    && params.recentScores.length >= INFERRED_MIN_RECENT_SCORES
    && params.recentScores.every(s => s < INFERRED_SCORE_THRESHOLD)
  ) {
    return {
      date: params.referenceDate ?? null,
      source: 'inferred-v1',
    }
  }

  return { date: null, source: null }
}

// --- Multi-Peak Detection ---

export const detectMultiPeak = (params: {
  localMaxScore: number
  episodeMaxScore: number
  dormantGapDays: number
}): { isMultiPeak: boolean; isNewEpisode: boolean } => {
  // Reignition: dormant gap >= 14 days → always new episode (PRD §10.4/§10.5)
  if (params.dormantGapDays >= DORMANT_GAP_REIGNITION_DAYS) {
    return { isMultiPeak: false, isNewEpisode: true }
  }

  // Multi-peak: within 5% of episode max AND gap < 14 days
  const withinTolerance =
    params.localMaxScore >= params.episodeMaxScore * (1 - MULTI_PEAK_TOLERANCE_PCT / 100)

  if (withinTolerance) {
    return { isMultiPeak: true, isNewEpisode: false }
  }

  return { isMultiPeak: false, isNewEpisode: false }
}

// --- Primary Peak Date ---

export const findPrimaryPeakDate = (
  scores: { date: string; smoothedScore: number }[],
): string | null => {
  if (scores.length === 0) return null

  let maxScore = -Infinity
  let peakDate: string | null = null

  for (const entry of scores) {
    if (entry.smoothedScore > maxScore) {
      maxScore = entry.smoothedScore
      peakDate = entry.date
    }
  }

  return peakDate
}

// --- 7-Day Simple Moving Average Smoothing ---

export const smoothScores7d = (
  dailyScores: { date: string; score: number }[],
): { date: string; smoothedScore: number }[] => {
  if (dailyScores.length === 0) return []

  // Sort by date ascending
  const sorted = [...dailyScores].sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((entry, i) => {
    const windowStart = Math.max(0, i - SMOOTHING_WINDOW + 1)
    const window = sorted.slice(windowStart, i + 1)
    const avg = window.reduce((sum, e) => sum + e.score, 0) / window.length
    return {
      date: entry.date,
      smoothedScore: Math.round(avg * 100) / 100,
    }
  })
}

// --- Label Audit Validation ---

const countOverlappingEpisodes = (episodes: EpisodeForAudit[]): number => {
  // Group by theme_id
  const byTheme = new Map<string, EpisodeForAudit[]>()
  for (const ep of episodes) {
    const list = byTheme.get(ep.theme_id) ?? []
    list.push(ep)
    byTheme.set(ep.theme_id, list)
  }

  let overlapCount = 0
  for (const themeEpisodes of byTheme.values()) {
    if (themeEpisodes.length < 2) continue

    // Sort by start date
    const sorted = [...themeEpisodes].sort((a, b) =>
      a.episode_start.localeCompare(b.episode_start),
    )

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]

      // Check against ALL subsequent episodes, not just the next one
      for (let j = i + 1; j < sorted.length; j++) {
        const later = sorted[j]

        // Current has no end → open-ended, overlaps with everything after
        if (current.episode_end === null) {
          overlapCount++
          continue
        }

        // Overlap: current end > later start
        if (current.episode_end > later.episode_start) {
          overlapCount++
        }
      }
    }
  }

  return overlapCount
}

const isInferredBoundary = (ep: EpisodeForAudit): boolean =>
  ep.boundary_source_start === 'inferred-v1' || ep.boundary_source_end === 'inferred-v1'

const computeInferredRatio = (episodes: EpisodeForAudit[]): number => {
  if (episodes.length === 0) return 0
  const inferredCount = episodes.filter(isInferredBoundary).length
  return inferredCount / episodes.length
}

const computeWorstSlice = (
  episodes: EpisodeForAudit[],
): { worstSlice: string | null; ratio: number } => {
  const bySlice = new Map<string, EpisodeForAudit[]>()

  for (const ep of episodes) {
    if (!ep.priority_slice) continue
    const list = bySlice.get(ep.priority_slice) ?? []
    list.push(ep)
    bySlice.set(ep.priority_slice, list)
  }

  if (bySlice.size === 0) return { worstSlice: null, ratio: 0 }

  let worstSlice: string | null = null
  let worstRatio = 0

  for (const [slice, sliceEpisodes] of bySlice.entries()) {
    const ratio = computeInferredRatio(sliceEpisodes)
    if (ratio > worstRatio) {
      worstRatio = ratio
      worstSlice = slice
    }
  }

  return { worstSlice, ratio: worstRatio }
}

const countRightCensoredAsNegatives = (episodes: EpisodeForAudit[]): number =>
  episodes.filter(ep => ep.episode_end === null && ep.is_completed).length

export interface ValidateLabelAuditOptions {
  futureInformedBoundaryChangesCount: number
}

export const validateLabelAudit = (
  episodes: EpisodeForAudit[],
  options: ValidateLabelAuditOptions = { futureInformedBoundaryChangesCount: 0 },
): LabelAuditResult => {
  const thresholds = GATE_THRESHOLDS.labelAudit

  // 1. Overlapping episodes check
  const overlapCount = countOverlappingEpisodes(episodes)
  const overlappingEpisodes = {
    passed: overlapCount <= thresholds.overlappingEpisodesCeiling,
    count: overlapCount,
  }

  // 2. Inferred boundary ratio (overall)
  const overallRatio = computeInferredRatio(episodes)
  const inferredBoundaryOverall = {
    passed: overallRatio <= thresholds.inferredBoundaryOverallCeiling,
    ratio: overallRatio,
    threshold: thresholds.inferredBoundaryOverallCeiling,
  }

  // 3. Inferred boundary ratio (per priority slice)
  const { worstSlice, ratio: sliceRatio } = computeWorstSlice(episodes)
  const inferredBoundarySlice = {
    passed: worstSlice === null || sliceRatio <= thresholds.inferredBoundarySliceCeiling,
    worstSlice,
    ratio: sliceRatio,
    threshold: thresholds.inferredBoundarySliceCeiling,
  }

  // 4. Right-censored as completed negatives
  const rightCensoredCount = countRightCensoredAsNegatives(episodes)
  const rightCensoredAsNegatives = {
    passed: rightCensoredCount <= thresholds.rightCensoredAsNegativesCeiling,
    count: rightCensoredCount,
  }

  // 5. Future-informed boundary changes (replay check)
  // Caller must provide the count from replay comparison (TCAR-007/011).
  const futureInformedBoundaryChanges = {
    passed: options.futureInformedBoundaryChangesCount <= thresholds.futureInformedBoundaryChangesCeiling,
    count: options.futureInformedBoundaryChangesCount,
  }

  const allPassed =
    overlappingEpisodes.passed
    && inferredBoundaryOverall.passed
    && inferredBoundarySlice.passed
    && rightCensoredAsNegatives.passed
    && futureInformedBoundaryChanges.passed

  return {
    passed: allPassed,
    checks: {
      overlappingEpisodes,
      inferredBoundaryOverall,
      inferredBoundarySlice,
      rightCensoredAsNegatives,
      futureInformedBoundaryChanges,
    },
  }
}
