import { describe, expect, it } from 'vitest'
import {
  classifyEpisodeStart,
  classifyEpisodeEnd,
  detectMultiPeak,
  findPrimaryPeakDate,
  smoothScores7d,
  validateLabelAudit,
  type EpisodeForAudit,
} from '../episode-policy'
import type { ThemeStateHistoryV2 } from '../types/db'
import { GATE_THRESHOLDS } from '../forecast/types'

// --- Helpers ---

const makeHistory = (overrides: Partial<ThemeStateHistoryV2> = {}): ThemeStateHistoryV2 => ({
  theme_id: 'th-001',
  effective_from: '2026-01-01',
  effective_to: null,
  is_active: true,
  closed_at: null,
  first_spike_date: null,
  state_version: 'live-v1',
  ...overrides,
})

const makeAuditEpisode = (overrides: Partial<EpisodeForAudit> = {}): EpisodeForAudit => ({
  episode_id: 'ep-001',
  theme_id: 'th-001',
  boundary_source_start: 'observed',
  boundary_source_end: 'observed',
  episode_start: '2026-01-01',
  episode_end: '2026-02-01',
  is_active: false,
  is_completed: true,
  ...overrides,
})

// --- Tests ---

describe('TCAR-005: episode-policy', () => {
  describe('classifyEpisodeStart', () => {
    it('returns effective_from as start date with observed source for active theme', () => {
      const history = makeHistory({ effective_from: '2026-01-15', is_active: true })
      const result = classifyEpisodeStart(history)
      expect(result.date).toBe('2026-01-15')
      expect(result.source).toBe('observed')
    })

    it('returns observed source when theme has closed_at', () => {
      const history = makeHistory({
        effective_from: '2025-06-01',
        is_active: false,
        closed_at: '2025-12-01',
      })
      const result = classifyEpisodeStart(history)
      expect(result.date).toBe('2025-06-01')
      expect(result.source).toBe('observed')
    })

    it('returns imported source when state_version is backfill-v1 and not active', () => {
      const history = makeHistory({
        effective_from: '2025-03-01',
        is_active: false,
        closed_at: null,
        state_version: 'backfill-v1',
      })
      const result = classifyEpisodeStart(history)
      expect(result.source).toBe('imported')
    })

    it('returns observed source when state_version is live-v1', () => {
      const history = makeHistory({
        effective_from: '2026-02-01',
        state_version: 'live-v1',
      })
      const result = classifyEpisodeStart(history)
      expect(result.source).toBe('observed')
    })
  })

  describe('classifyEpisodeEnd', () => {
    it('returns observed end when closedAt is provided', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 0,
        recentScores: [50, 45, 40],
        closedAt: '2026-02-15',
      })
      expect(result.date).toBe('2026-02-15')
      expect(result.source).toBe('observed')
    })

    it('returns inferred-v1 when notSeenDays >= 30 AND all recent 14d scores < 15', () => {
      const lowScores = Array(14).fill(10)
      const result = classifyEpisodeEnd({
        notSeenDays: 35,
        recentScores: lowScores,
        referenceDate: '2026-03-01',
      })
      expect(result.date).toBe('2026-03-01')
      expect(result.source).toBe('inferred-v1')
    })

    it('returns null when notSeenDays >= 30 but scores not all below 15', () => {
      const mixedScores = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 20]
      const result = classifyEpisodeEnd({
        notSeenDays: 35,
        recentScores: mixedScores,
      })
      expect(result.date).toBeNull()
      expect(result.source).toBeNull()
    })

    it('returns null when notSeenDays < 30 even with low scores', () => {
      const lowScores = Array(14).fill(5)
      const result = classifyEpisodeEnd({
        notSeenDays: 20,
        recentScores: lowScores,
      })
      expect(result.date).toBeNull()
      expect(result.source).toBeNull()
    })

    it('returns null when no closedAt and conditions not met', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 10,
        recentScores: [50, 60, 70],
      })
      expect(result.date).toBeNull()
      expect(result.source).toBeNull()
    })

    it('prioritizes observed closedAt over inferred conditions', () => {
      const lowScores = Array(14).fill(5)
      const result = classifyEpisodeEnd({
        notSeenDays: 40,
        recentScores: lowScores,
        closedAt: '2026-01-20',
      })
      expect(result.date).toBe('2026-01-20')
      expect(result.source).toBe('observed')
    })

    it('handles empty recentScores array', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 40,
        recentScores: [],
      })
      expect(result.date).toBeNull()
      expect(result.source).toBeNull()
    })

    it('rejects inferred end when fewer than 14 recent scores', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 40,
        recentScores: Array(13).fill(5),
      })
      expect(result.date).toBeNull()
      expect(result.source).toBeNull()
    })

    it('returns observed end when effectiveTo is provided (PRD §10.2)', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 0,
        recentScores: [50, 45, 40],
        effectiveTo: '2026-02-28',
      })
      expect(result.date).toBe('2026-02-28')
      expect(result.source).toBe('observed')
    })

    it('prioritizes closedAt over effectiveTo', () => {
      const result = classifyEpisodeEnd({
        notSeenDays: 0,
        recentScores: [50],
        closedAt: '2026-02-15',
        effectiveTo: '2026-02-28',
      })
      expect(result.date).toBe('2026-02-15')
      expect(result.source).toBe('observed')
    })

    it('falls through to inferred when effectiveTo is absent', () => {
      const lowScores = Array(14).fill(5)
      const result = classifyEpisodeEnd({
        notSeenDays: 35,
        recentScores: lowScores,
        referenceDate: '2026-03-01',
      })
      expect(result.source).toBe('inferred-v1')
    })
  })

  describe('detectMultiPeak', () => {
    it('detects multi-peak when local max within 5% of episode max and gap < 14 days', () => {
      const result = detectMultiPeak({
        localMaxScore: 78,
        episodeMaxScore: 80,
        dormantGapDays: 10,
      })
      expect(result.isMultiPeak).toBe(true)
      expect(result.isNewEpisode).toBe(false)
    })

    it('detects new episode (reignition) when dormant gap >= 14 days', () => {
      const result = detectMultiPeak({
        localMaxScore: 78,
        episodeMaxScore: 80,
        dormantGapDays: 14,
      })
      expect(result.isMultiPeak).toBe(false)
      expect(result.isNewEpisode).toBe(true)
    })

    it('returns neither when local max is more than 5% below episode max', () => {
      const result = detectMultiPeak({
        localMaxScore: 70,
        episodeMaxScore: 80,
        dormantGapDays: 5,
      })
      expect(result.isMultiPeak).toBe(false)
      expect(result.isNewEpisode).toBe(false)
    })

    it('detects multi-peak at exact 5% boundary (inclusive)', () => {
      // 5% of 100 = 5, so 95 is within 5%
      const result = detectMultiPeak({
        localMaxScore: 95,
        episodeMaxScore: 100,
        dormantGapDays: 3,
      })
      expect(result.isMultiPeak).toBe(true)
      expect(result.isNewEpisode).toBe(false)
    })

    it('does not detect multi-peak just outside 5% boundary', () => {
      // 5% of 100 = 5, so 94.9 is outside 5%
      const result = detectMultiPeak({
        localMaxScore: 94.9,
        episodeMaxScore: 100,
        dormantGapDays: 3,
      })
      expect(result.isMultiPeak).toBe(false)
      expect(result.isNewEpisode).toBe(false)
    })

    it('returns new episode when within 5% but gap >= 14 days', () => {
      const result = detectMultiPeak({
        localMaxScore: 76,
        episodeMaxScore: 80,
        dormantGapDays: 20,
      })
      expect(result.isMultiPeak).toBe(false)
      expect(result.isNewEpisode).toBe(true)
    })

    it('returns new episode when NOT within 5% AND gap >= 14 days (weak reignition)', () => {
      const result = detectMultiPeak({
        localMaxScore: 50,
        episodeMaxScore: 80,
        dormantGapDays: 20,
      })
      expect(result.isMultiPeak).toBe(false)
      expect(result.isNewEpisode).toBe(true)
    })
  })

  describe('findPrimaryPeakDate', () => {
    it('returns the date of the earliest maximum smoothed score', () => {
      const scores = [
        { date: '2026-01-01', smoothedScore: 50 },
        { date: '2026-01-02', smoothedScore: 70 },
        { date: '2026-01-03', smoothedScore: 90 },
        { date: '2026-01-04', smoothedScore: 90 },
        { date: '2026-01-05', smoothedScore: 80 },
      ]
      expect(findPrimaryPeakDate(scores)).toBe('2026-01-03')
    })

    it('returns null for empty array', () => {
      expect(findPrimaryPeakDate([])).toBeNull()
    })

    it('returns the single date when only one score exists', () => {
      const scores = [{ date: '2026-01-01', smoothedScore: 42 }]
      expect(findPrimaryPeakDate(scores)).toBe('2026-01-01')
    })

    it('picks earliest date when multiple dates share max score', () => {
      const scores = [
        { date: '2026-01-10', smoothedScore: 85 },
        { date: '2026-01-15', smoothedScore: 85 },
        { date: '2026-01-20', smoothedScore: 85 },
      ]
      expect(findPrimaryPeakDate(scores)).toBe('2026-01-10')
    })
  })

  describe('smoothScores7d', () => {
    it('returns 7-day simple moving average for each date', () => {
      const dailyScores = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        score: (i + 1) * 10,
      }))
      const result = smoothScores7d(dailyScores)
      expect(result).toHaveLength(10)
      // First 6 entries: window is shorter than 7
      // 7th entry (index 6): avg of scores 10,20,30,40,50,60,70 = 280/7 = 40
      expect(result[6].smoothedScore).toBe(40)
      expect(result[6].date).toBe('2026-01-07')
    })

    it('handles empty input', () => {
      expect(smoothScores7d([])).toEqual([])
    })

    it('handles single entry', () => {
      const result = smoothScores7d([{ date: '2026-01-01', score: 50 }])
      expect(result).toHaveLength(1)
      expect(result[0].smoothedScore).toBe(50)
      expect(result[0].date).toBe('2026-01-01')
    })

    it('preserves date ordering', () => {
      const dailyScores = [
        { date: '2026-01-03', score: 30 },
        { date: '2026-01-01', score: 10 },
        { date: '2026-01-02', score: 20 },
      ]
      const result = smoothScores7d(dailyScores)
      expect(result[0].date).toBe('2026-01-01')
      expect(result[1].date).toBe('2026-01-02')
      expect(result[2].date).toBe('2026-01-03')
    })

    it('uses trailing window (no look-ahead)', () => {
      const dailyScores = [
        { date: '2026-01-01', score: 100 },
        { date: '2026-01-02', score: 0 },
        { date: '2026-01-03', score: 0 },
      ]
      const result = smoothScores7d(dailyScores)
      // First entry: only 1 data point, avg = 100
      expect(result[0].smoothedScore).toBe(100)
      // Second entry: window = [100, 0], avg = 50
      expect(result[1].smoothedScore).toBe(50)
      // Third entry: window = [100, 0, 0], avg ≈ 33
      expect(result[2].smoothedScore).toBeCloseTo(33.33, 0)
    })
  })

  describe('validateLabelAudit', () => {
    it('passes when all checks are clean', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-001',
          episode_start: '2026-01-01',
          episode_end: '2026-01-31',
          boundary_source_start: 'observed',
          boundary_source_end: 'observed',
          is_completed: true,
          is_active: false,
        }),
        makeAuditEpisode({
          episode_id: 'ep-002',
          episode_start: '2026-02-01',
          episode_end: '2026-02-28',
          boundary_source_start: 'observed',
          boundary_source_end: 'observed',
          is_completed: true,
          is_active: false,
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.passed).toBe(true)
      expect(result.checks.overlappingEpisodes.passed).toBe(true)
      expect(result.checks.overlappingEpisodes.count).toBe(0)
      expect(result.checks.inferredBoundaryOverall.passed).toBe(true)
      expect(result.checks.inferredBoundarySlice.passed).toBe(true)
      expect(result.checks.rightCensoredAsNegatives.passed).toBe(true)
      expect(result.checks.futureInformedBoundaryChanges.passed).toBe(true)
    })

    it('fails when episodes overlap for same theme', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-001',
          theme_id: 'th-001',
          episode_start: '2026-01-01',
          episode_end: '2026-01-31',
        }),
        makeAuditEpisode({
          episode_id: 'ep-002',
          theme_id: 'th-001',
          episode_start: '2026-01-15',
          episode_end: '2026-02-15',
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.passed).toBe(false)
      expect(result.checks.overlappingEpisodes.passed).toBe(false)
      expect(result.checks.overlappingEpisodes.count).toBeGreaterThan(0)
    })

    it('does not flag overlap for episodes of different themes', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-001',
          theme_id: 'th-001',
          episode_start: '2026-01-01',
          episode_end: '2026-01-31',
        }),
        makeAuditEpisode({
          episode_id: 'ep-002',
          theme_id: 'th-002',
          episode_start: '2026-01-15',
          episode_end: '2026-02-15',
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.checks.overlappingEpisodes.passed).toBe(true)
      expect(result.checks.overlappingEpisodes.count).toBe(0)
    })

    it('fails when inferred boundary ratio exceeds 15% overall', () => {
      // 3 inferred out of 10 = 30% > 15%
      const episodes: EpisodeForAudit[] = Array.from({ length: 10 }, (_, i) => {
        const isInferred = i < 3
        return makeAuditEpisode({
          episode_id: `ep-${i}`,
          theme_id: `th-${i}`,
          episode_start: `2026-01-${String(i * 3 + 1).padStart(2, '0')}`,
          episode_end: `2026-01-${String(i * 3 + 3).padStart(2, '0')}`,
          boundary_source_start: isInferred ? 'inferred-v1' : 'observed',
          boundary_source_end: isInferred ? 'inferred-v1' : 'observed',
        })
      })
      const result = validateLabelAudit(episodes)
      expect(result.checks.inferredBoundaryOverall.passed).toBe(false)
      expect(result.checks.inferredBoundaryOverall.ratio).toBeGreaterThan(
        GATE_THRESHOLDS.labelAudit.inferredBoundaryOverallCeiling,
      )
    })

    it('passes when inferred boundary ratio is at exactly 15%', () => {
      // 3 out of 20 = 15% = ceiling (should pass at <=)
      const episodes: EpisodeForAudit[] = Array.from({ length: 20 }, (_, i) => {
        const isInferred = i < 3
        return makeAuditEpisode({
          episode_id: `ep-${i}`,
          theme_id: `th-${i}`,
          episode_start: `2026-0${Math.floor(i / 10) + 1}-${String((i % 10) * 3 + 1).padStart(2, '0')}`,
          episode_end: `2026-0${Math.floor(i / 10) + 1}-${String((i % 10) * 3 + 3).padStart(2, '0')}`,
          boundary_source_start: isInferred ? 'inferred-v1' : 'observed',
          boundary_source_end: 'observed',
        })
      })
      const result = validateLabelAudit(episodes)
      expect(result.checks.inferredBoundaryOverall.passed).toBe(true)
    })

    it('fails when a priority slice exceeds 10% inferred', () => {
      // All episodes in slice "crypto" with 2 out of 5 inferred = 40% > 10%
      const episodes: EpisodeForAudit[] = Array.from({ length: 5 }, (_, i) => {
        const isInferred = i < 2
        return makeAuditEpisode({
          episode_id: `ep-${i}`,
          theme_id: `th-${i}`,
          episode_start: `2026-01-${String(i * 5 + 1).padStart(2, '0')}`,
          episode_end: `2026-01-${String(i * 5 + 5).padStart(2, '0')}`,
          boundary_source_start: isInferred ? 'inferred-v1' : 'observed',
          boundary_source_end: 'observed',
          priority_slice: 'crypto',
        })
      })
      const result = validateLabelAudit(episodes)
      expect(result.checks.inferredBoundarySlice.passed).toBe(false)
      expect(result.checks.inferredBoundarySlice.worstSlice).toBe('crypto')
    })

    it('skips slice check when no priority_slice is set', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({ boundary_source_start: 'inferred-v1' }),
      ]
      const result = validateLabelAudit(episodes)
      // With 1 inferred out of 1 = 100% overall fail, but no slice
      expect(result.checks.inferredBoundarySlice.passed).toBe(true)
      expect(result.checks.inferredBoundarySlice.worstSlice).toBeNull()
    })

    it('fails when right-censored episode is marked as completed', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-active',
          episode_end: null,
          is_active: true,
          is_completed: true, // violation: right-censored but marked completed
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.passed).toBe(false)
      expect(result.checks.rightCensoredAsNegatives.passed).toBe(false)
      expect(result.checks.rightCensoredAsNegatives.count).toBe(1)
    })

    it('does not flag right-censored episode that is not completed', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-active',
          episode_end: null,
          is_active: true,
          is_completed: false,
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.checks.rightCensoredAsNegatives.passed).toBe(true)
      expect(result.checks.rightCensoredAsNegatives.count).toBe(0)
    })

    it('uses GATE_THRESHOLDS constants', () => {
      // Verify we're not hardcoding thresholds
      expect(GATE_THRESHOLDS.labelAudit.overlappingEpisodesCeiling).toBe(0)
      expect(GATE_THRESHOLDS.labelAudit.inferredBoundaryOverallCeiling).toBe(0.15)
      expect(GATE_THRESHOLDS.labelAudit.inferredBoundarySliceCeiling).toBe(0.10)
      expect(GATE_THRESHOLDS.labelAudit.rightCensoredAsNegativesCeiling).toBe(0)
      expect(GATE_THRESHOLDS.labelAudit.futureInformedBoundaryChangesCeiling).toBe(0)
    })

    it('handles empty episodes array', () => {
      const result = validateLabelAudit([])
      expect(result.passed).toBe(true)
      expect(result.checks.overlappingEpisodes.count).toBe(0)
      expect(result.checks.rightCensoredAsNegatives.count).toBe(0)
    })

    it('fails when futureInformedBoundaryChangesCount > 0', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({ boundary_source_start: 'observed', boundary_source_end: 'observed' }),
      ]
      const result = validateLabelAudit(episodes, { futureInformedBoundaryChangesCount: 1 })
      expect(result.passed).toBe(false)
      expect(result.checks.futureInformedBoundaryChanges.passed).toBe(false)
      expect(result.checks.futureInformedBoundaryChanges.count).toBe(1)
    })

    it('passes futureInformed check with explicit zero count', () => {
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({ boundary_source_start: 'observed', boundary_source_end: 'observed' }),
      ]
      const result = validateLabelAudit(episodes, { futureInformedBoundaryChangesCount: 0 })
      expect(result.checks.futureInformedBoundaryChanges.passed).toBe(true)
      expect(result.checks.futureInformedBoundaryChanges.count).toBe(0)
    })

    it('defaults futureInformedBoundaryChangesCount to 0 when options omitted', () => {
      const result = validateLabelAudit([makeAuditEpisode()])
      expect(result.checks.futureInformedBoundaryChanges.passed).toBe(true)
      expect(result.checks.futureInformedBoundaryChanges.count).toBe(0)
    })

    it('returns correct LabelAuditResult structure', () => {
      const result = validateLabelAudit([makeAuditEpisode()])
      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('checks')
      expect(result.checks).toHaveProperty('overlappingEpisodes')
      expect(result.checks).toHaveProperty('inferredBoundaryOverall')
      expect(result.checks).toHaveProperty('inferredBoundarySlice')
      expect(result.checks).toHaveProperty('rightCensoredAsNegatives')
      expect(result.checks).toHaveProperty('futureInformedBoundaryChanges')
    })

    it('fails overall when any single check fails', () => {
      // Only overlap fails, rest pass
      const episodes: EpisodeForAudit[] = [
        makeAuditEpisode({
          episode_id: 'ep-001',
          theme_id: 'th-001',
          episode_start: '2026-01-01',
          episode_end: '2026-01-31',
        }),
        makeAuditEpisode({
          episode_id: 'ep-002',
          theme_id: 'th-001',
          episode_start: '2026-01-15',
          episode_end: '2026-02-15',
        }),
      ]
      const result = validateLabelAudit(episodes)
      expect(result.passed).toBe(false)
    })
  })
})
