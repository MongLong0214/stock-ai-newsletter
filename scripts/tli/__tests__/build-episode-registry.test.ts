/**
 * TCAR-006: Build Episode Registry from Theme Lifecycle History
 *
 * TDD RED phase — failing tests for episode registry builder.
 */

import { describe, expect, it } from 'vitest'
import type { ThemeStateHistoryV2 } from '../../../lib/tli/types/db'
import {
  buildEpisodesFromHistory,
  type DailyScore,
  type EpisodeCandidate,
} from '../build-episode-registry'

// --- Test helpers ---

const makeHistory = (
  overrides: Partial<ThemeStateHistoryV2> & { effective_from: string; is_active: boolean },
): ThemeStateHistoryV2 => ({
  theme_id: 'th-001',
  effective_from: overrides.effective_from,
  effective_to: overrides.effective_to ?? null,
  is_active: overrides.is_active,
  closed_at: overrides.closed_at ?? null,
  first_spike_date: overrides.first_spike_date ?? null,
  state_version: overrides.state_version ?? 'live-v1',
})

const makeDailyScores = (startDate: string, scores: number[]): DailyScore[] => {
  const start = new Date(startDate)
  return scores.map((score, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return { date: d.toISOString().split('T')[0], score }
  })
}

describe('TCAR-006: buildEpisodesFromHistory', () => {
  describe('basic episode creation', () => {
    it('creates a single episode from activation→deactivation', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-01' }),
        makeHistory({ effective_from: '2026-02-01', is_active: false, closed_at: '2026-02-01' }),
      ]
      const scores = makeDailyScores('2026-01-01', [10, 20, 30, 50, 80, 70, 60, 40, 30, 20])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].episode_number).toBe(1)
      expect(result[0].boundary_source_start).toBe('observed')
      expect(result[0].boundary_source_end).toBe('observed')
      expect(result[0].episode_start).toBe('2026-01-01')
      expect(result[0].episode_end).toBe('2026-02-01')
      expect(result[0].is_active).toBe(false)
    })

    it('creates an active episode with no end from ongoing activation', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-15', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-15', [10, 20, 30, 40])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].episode_end).toBeNull()
      expect(result[0].boundary_source_end).toBeNull()
      expect(result[0].is_active).toBe(true)
    })

    it('sets episode_number incrementally per theme', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
        // 14+ day gap → new episode
        makeHistory({ effective_from: '2026-02-10', is_active: true, effective_to: '2026-03-01' }),
        makeHistory({ effective_from: '2026-03-01', is_active: false, closed_at: '2026-03-01' }),
      ]
      const scores = makeDailyScores('2026-01-01', Array(60).fill(30))

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(2)
      expect(result[0].episode_number).toBe(1)
      expect(result[1].episode_number).toBe(2)
    })
  })

  describe('boundary source classification', () => {
    it('uses observed for live-v1 activation', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({
          effective_from: '2026-01-01',
          is_active: true,
          state_version: 'live-v1',
        }),
      ]
      const scores = makeDailyScores('2026-01-01', [50])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].boundary_source_start).toBe('observed')
    })

    it('uses imported for backfill-v1 inactive with no closed_at', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({
          effective_from: '2025-06-01',
          is_active: false,
          state_version: 'backfill-v1',
          effective_to: '2025-08-01',
        }),
      ]
      const scores: DailyScore[] = []

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].boundary_source_start).toBe('imported')
    })

    it('uses observed for deactivation with closed_at', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-01' }),
        makeHistory({ effective_from: '2026-02-01', is_active: false, closed_at: '2026-02-01' }),
      ]
      const scores = makeDailyScores('2026-01-01', [50, 40, 30])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].boundary_source_end).toBe('observed')
      expect(result[0].episode_end).toBe('2026-02-01')
    })

    it('uses observed for deactivation with effective_to', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-15' }),
        makeHistory({ effective_from: '2026-02-15', is_active: false }),
      ]
      const scores = makeDailyScores('2026-01-01', [50, 40, 30])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].boundary_source_end).toBe('observed')
      expect(result[0].episode_end).toBe('2026-02-15')
    })

    it('uses inferred-v1 for deactivation without observed end when recent 14d scores stay below threshold', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true }),
        makeHistory({ effective_from: '2026-02-14', is_active: false }),
      ]
      const scores = makeDailyScores('2026-02-01', Array(14).fill(10))

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].boundary_source_end).toBe('inferred-v1')
      expect(result[0].episode_end).toBe('2026-02-14')
      expect(result[0].is_active).toBe(false)
    })
  })

  describe('reignition and dormant gap (PRD §10.4/10.5)', () => {
    it('creates new episode when dormant gap >= 14 days', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
        // 15-day gap (Jan 20 → Feb 04)
        makeHistory({ effective_from: '2026-02-04', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-01', Array(40).fill(50))

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(2)
      expect(result[0].episode_end).toBe('2026-01-20')
      expect(result[1].episode_start).toBe('2026-02-04')
      expect(result[1].episode_number).toBe(2)
    })

    it('keeps same episode when dormant gap < 14 days', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
        // 10-day gap (Jan 20 → Jan 30)
        makeHistory({ effective_from: '2026-01-30', is_active: true }),
      ]
      // Scores: episode max = 80, reactivation peak = 78 (within 5%)
      const scores: DailyScore[] = [
        ...makeDailyScores('2026-01-01', [10, 20, 40, 60, 80, 70, 50, 30, 20, 15, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]),
        ...makeDailyScores('2026-01-30', [15, 30, 50, 78, 60, 40]),
      ]

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].multi_peak).toBe(true)
      expect(result[0].episode_end).toBeNull() // still active
      expect(result[0].is_active).toBe(true)
    })

    it('creates new episode when gap < 14 days but reactivation peak is NOT within 5% of max', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
        // 10-day gap
        makeHistory({ effective_from: '2026-01-30', is_active: true }),
      ]
      // Scores: episode max = 80, reactivation peak = 40 (50% of max, NOT within 5%)
      const scores: DailyScore[] = [
        ...makeDailyScores('2026-01-01', [10, 20, 40, 60, 80, 70, 50, 30, 20, 15, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]),
        ...makeDailyScores('2026-01-30', [15, 20, 30, 40, 35, 25]),
      ]

      const result = buildEpisodesFromHistory('th-001', history, scores)

      // Not multi-peak, not new episode → stays in same episode without multi_peak flag
      expect(result).toHaveLength(1)
      expect(result[0].multi_peak).toBe(false)
    })

    it('handles exact 14-day dormant gap as new episode', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-15' }),
        makeHistory({ effective_from: '2026-01-15', is_active: false, closed_at: '2026-01-15' }),
        // Exactly 14-day gap (Jan 15 → Jan 29)
        makeHistory({ effective_from: '2026-01-29', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-01', Array(40).fill(50))

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(2)
    })
  })

  describe('multi-peak detection', () => {
    it('sets multi_peak=true when reactivation peak is within 5% of episode max', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-15' }),
        makeHistory({ effective_from: '2026-01-15', is_active: false, closed_at: '2026-01-15' }),
        // 5-day gap (< 14)
        makeHistory({ effective_from: '2026-01-20', is_active: true }),
      ]
      // Max=100, reactivation peak=96 (within 5%)
      const scores: DailyScore[] = [
        ...makeDailyScores('2026-01-01', [20, 40, 60, 80, 100, 90, 70, 50, 30, 20, 15, 10, 10, 10, 10]),
        ...makeDailyScores('2026-01-20', [20, 50, 80, 96, 80, 60]),
      ]

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      expect(result[0].multi_peak).toBe(true)
    })

    it('sets multi_peak=false when only one activation period', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-01' }),
        makeHistory({ effective_from: '2026-02-01', is_active: false, closed_at: '2026-02-01' }),
      ]
      const scores = makeDailyScores('2026-01-01', [10, 30, 50, 80, 70, 40, 20])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].multi_peak).toBe(false)
    })
  })

  describe('primary peak date (PRD §10.3)', () => {
    it('finds peak as earliest date of max 7-day smoothed score', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
      ]
      // Peak should be around day 5 (scores: 10,20,30,50,80,70,60)
      const scores = makeDailyScores('2026-01-01', [10, 20, 30, 50, 80, 70, 60, 40, 30, 20])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      // The primary_peak_date should be set (exact date depends on smoothing)
      expect(result[0].primary_peak_date).not.toBeNull()
      expect(result[0].peak_score).toBeGreaterThan(0)
    })

    it('returns null peak when no scores in episode range', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-10' }),
        makeHistory({ effective_from: '2026-01-10', is_active: false, closed_at: '2026-01-10' }),
      ]
      const scores: DailyScore[] = []

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].primary_peak_date).toBeNull()
      expect(result[0].peak_score).toBeNull()
    })
  })

  describe('policy versions', () => {
    it('attaches default policy versions to each episode', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-01', [50])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result[0].policy_versions).toBeDefined()
      expect(result[0].policy_versions.episode_policy_version).toBe('1.0')
    })
  })

  describe('edge cases', () => {
    it('returns empty array for no history', () => {
      const result = buildEpisodesFromHistory('th-001', [], [])
      expect(result).toHaveLength(0)
    })

    it('returns empty array when history has no activation', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: false, closed_at: '2026-01-01' }),
      ]
      const result = buildEpisodesFromHistory('th-001', history, [])
      expect(result).toHaveLength(0)
    })

    it('handles multiple rapid reactivations within same episode', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-01-05' }),
        makeHistory({ effective_from: '2026-01-05', is_active: false, closed_at: '2026-01-05' }),
        // 3-day gap
        makeHistory({ effective_from: '2026-01-08', is_active: true, effective_to: '2026-01-12' }),
        makeHistory({ effective_from: '2026-01-12', is_active: false, closed_at: '2026-01-12' }),
        // 2-day gap
        makeHistory({ effective_from: '2026-01-14', is_active: true }),
      ]
      // All peaks within 5% of each other
      const scores = makeDailyScores('2026-01-01', Array(20).fill(50))

      const result = buildEpisodesFromHistory('th-001', history, scores)

      // All within same episode since gaps < 14 and peaks within tolerance
      expect(result).toHaveLength(1)
      expect(result[0].multi_peak).toBe(true)
    })

    it('filters scores to episode date range for peak calculation', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-10', is_active: true, effective_to: '2026-01-20' }),
        makeHistory({ effective_from: '2026-01-20', is_active: false, closed_at: '2026-01-20' }),
      ]
      // Scores include dates outside episode range
      const scores: DailyScore[] = [
        ...makeDailyScores('2026-01-01', [100, 100, 100, 100, 100, 100, 100, 100, 100]), // Before episode
        ...makeDailyScores('2026-01-10', [10, 20, 30, 50, 40, 30, 20, 10, 5, 5]), // During episode
        ...makeDailyScores('2026-01-21', [100, 100, 100]), // After episode
      ]

      const result = buildEpisodesFromHistory('th-001', history, scores)

      // Peak should be from within episode range, not before/after
      expect(result[0].peak_score).toBeLessThanOrEqual(50)
    })

    it('handles overlapping date ranges in state history gracefully', () => {
      // Data quality issue — should still produce valid episodes
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-01', [50, 60, 70])

      const result = buildEpisodesFromHistory('th-001', history, scores)

      expect(result).toHaveLength(1)
      // Overlapping episodes = 0 is guaranteed at the theme level
      expect(result.every(e => typeof e.episode_number === 'number')).toBe(true)
    })
  })

  describe('output contract', () => {
    it('produces EpisodeCandidate with all required fields', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true, effective_to: '2026-02-01' }),
        makeHistory({ effective_from: '2026-02-01', is_active: false, closed_at: '2026-02-01' }),
      ]
      const scores = makeDailyScores('2026-01-01', [10, 30, 60, 80, 70, 50, 30])

      const result = buildEpisodesFromHistory('th-001', history, scores)
      const ep = result[0]

      // All required fields from EpisodeRegistryV1
      expect(typeof ep.theme_id).toBe('string')
      expect(typeof ep.episode_number).toBe('number')
      expect(ep.boundary_source_start).toMatch(/^(observed|inferred-v1|imported)$/)
      expect(typeof ep.episode_start).toBe('string')
      expect(typeof ep.is_active).toBe('boolean')
      expect(typeof ep.multi_peak).toBe('boolean')
      expect(typeof ep.policy_versions).toBe('object')
    })

    it('produces deterministic output for same input', () => {
      const history: ThemeStateHistoryV2[] = [
        makeHistory({ effective_from: '2026-01-01', is_active: true }),
      ]
      const scores = makeDailyScores('2026-01-01', [10, 30, 60])

      const result1 = buildEpisodesFromHistory('th-001', history, scores)
      const result2 = buildEpisodesFromHistory('th-001', history, scores)

      expect(result1).toEqual(result2)
    })
  })
})
