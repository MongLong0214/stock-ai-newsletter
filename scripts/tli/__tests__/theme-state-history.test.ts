import { describe, expect, it } from 'vitest'
import {
  buildBackfillRow,
  buildOngoingStateChangeRow,
  buildCloseRowPatch,
  isStateHistoryBackfillComplete,
  getThemeStateAtDate,
  isArchetypeAtDate,
} from '../theme-state-history'

describe('theme state history', () => {
  describe('buildBackfillRow', () => {
    it('builds a state history row for an active theme', () => {
      const row = buildBackfillRow({
        themeId: 'theme-1',
        isActive: true,
        firstSpikeDate: '2026-01-15',
        createdAt: '2026-01-10T00:00:00Z',
        lastScoreDate: '2026-03-01',
        updatedAt: '2026-03-01T00:00:00Z',
      })
      expect(row.theme_id).toBe('theme-1')
      expect(row.effective_from).toBe('2026-01-10')
      expect(row.effective_to).toBeNull()
      expect(row.is_active).toBe(true)
      expect(row.closed_at).toBeNull()
      expect(row.first_spike_date).toBe('2026-01-15')
      expect(row.state_version).toBe('backfill-v1')
    })

    it('derives closed_at from last score date for inactive themes', () => {
      const row = buildBackfillRow({
        themeId: 'theme-2',
        isActive: false,
        firstSpikeDate: '2025-06-01',
        createdAt: '2025-05-15T00:00:00Z',
        lastScoreDate: '2025-12-20',
        updatedAt: '2025-12-22T00:00:00Z',
      })
      expect(row.is_active).toBe(false)
      expect(row.effective_from).toBe('2025-12-20')
      expect(row.effective_to).toBeNull()
      expect(row.closed_at).toBe('2025-12-20')
      expect(row.state_version).toBe('backfill-v1')
    })

    it('labels inactive themes without closed_at derivation as unknown', () => {
      const row = buildBackfillRow({
        themeId: 'theme-3',
        isActive: false,
        firstSpikeDate: null,
        createdAt: '2025-01-01T00:00:00Z',
        lastScoreDate: null,
        updatedAt: '2025-01-01T00:00:00Z',
      })
      expect(row.is_active).toBe(false)
      expect(row.closed_at).toBeNull()
      expect(row.state_version).toBe('unknown')
    })
  })

  describe('buildOngoingStateChangeRow', () => {
    it('builds an ongoing state row when a theme is activated', () => {
      const row = buildOngoingStateChangeRow({
        themeId: 'theme-1',
        newIsActive: true,
        firstSpikeDate: '2026-03-01',
        changeDate: '2026-03-11',
      })
      expect(row.is_active).toBe(true)
      expect(row.effective_from).toBe('2026-03-11')
      expect(row.effective_to).toBeNull()
      expect(row.closed_at).toBeNull()
      expect(row.state_version).toBe('live-v1')
    })

    it('builds an ongoing state row when a theme is deactivated', () => {
      const row = buildOngoingStateChangeRow({
        themeId: 'theme-1',
        newIsActive: false,
        firstSpikeDate: '2026-01-15',
        changeDate: '2026-03-11',
      })
      expect(row.is_active).toBe(false)
      expect(row.effective_from).toBe('2026-03-11')
      expect(row.closed_at).toBe('2026-03-11')
      expect(row.state_version).toBe('live-v1')
    })
  })

  describe('buildCloseRowPatch', () => {
    it('produces a patch that closes the effective_to', () => {
      const patch = buildCloseRowPatch({ changeDate: '2026-03-11' })
      expect(patch.effective_to).toBe('2026-03-11')
    })
  })

  describe('isStateHistoryBackfillComplete', () => {
    it('returns false when some themes have no state history', () => {
      expect(isStateHistoryBackfillComplete({
        totalThemeCount: 50,
        themesWithHistoryCount: 45,
      })).toBe(false)
    })

    it('returns true when all themes have state history', () => {
      expect(isStateHistoryBackfillComplete({
        totalThemeCount: 50,
        themesWithHistoryCount: 50,
      })).toBe(true)
    })

    it('returns false when there are no themes', () => {
      expect(isStateHistoryBackfillComplete({
        totalThemeCount: 0,
        themesWithHistoryCount: 0,
      })).toBe(false)
    })
  })

  describe('getThemeStateAtDate', () => {
    const history = [
      { theme_id: 't1', effective_from: '2026-01-01', effective_to: '2026-02-15', is_active: true, closed_at: null, first_spike_date: '2026-01-05', state_version: 'backfill-v1' },
      { theme_id: 't1', effective_from: '2026-02-15', effective_to: null, is_active: false, closed_at: '2026-02-15', first_spike_date: '2026-01-05', state_version: 'live-v1' },
    ]

    it('returns the theme state active at a specific date', () => {
      const state = getThemeStateAtDate('t1', '2026-02-01', history)
      expect(state?.is_active).toBe(true)

      const state2 = getThemeStateAtDate('t1', '2026-03-01', history)
      expect(state2?.is_active).toBe(false)
    })

    it('returns null when no state covers the date', () => {
      const state = getThemeStateAtDate('t1', '2025-12-31', history)
      expect(state).toBeNull()
    })

    it('returns null for unknown theme id', () => {
      const state = getThemeStateAtDate('unknown', '2026-02-01', history)
      expect(state).toBeNull()
    })
  })

  describe('isArchetypeAtDate', () => {
    it('returns true for closed inactive theme before run date', () => {
      const result = isArchetypeAtDate('t1', '2026-03-01', [
        { theme_id: 't1', effective_from: '2026-01-01', effective_to: null, is_active: false, closed_at: '2026-02-15', first_spike_date: '2026-01-05', state_version: 'backfill-v1' },
      ])
      expect(result).toBe(true)
    })

    it('returns false for active theme', () => {
      const result = isArchetypeAtDate('t1', '2026-03-01', [
        { theme_id: 't1', effective_from: '2026-01-01', effective_to: null, is_active: true, closed_at: null, first_spike_date: '2026-01-05', state_version: 'backfill-v1' },
      ])
      expect(result).toBe(false)
    })

    it('returns false for unknown state version (no closed_at)', () => {
      const result = isArchetypeAtDate('t1', '2026-03-01', [
        { theme_id: 't1', effective_from: '2025-01-01', effective_to: null, is_active: false, closed_at: null, first_spike_date: null, state_version: 'unknown' },
      ])
      expect(result).toBe(false)
    })

    it('returns false when closed_at is after run date', () => {
      const result = isArchetypeAtDate('t1', '2026-02-01', [
        { theme_id: 't1', effective_from: '2026-01-01', effective_to: null, is_active: false, closed_at: '2026-02-15', first_spike_date: '2026-01-05', state_version: 'backfill-v1' },
      ])
      expect(result).toBe(false)
    })

    it('does not treat a backfilled inactive theme as closed before its closed_at date', () => {
      const row = buildBackfillRow({
        themeId: 't2',
        isActive: false,
        firstSpikeDate: '2025-06-01',
        createdAt: '2025-05-15T00:00:00Z',
        lastScoreDate: '2025-12-20',
        updatedAt: '2025-12-22T00:00:00Z',
      })

      expect(isArchetypeAtDate('t2', '2025-12-10', [row])).toBe(false)
      expect(isArchetypeAtDate('t2', '2025-12-21', [row])).toBe(true)
    })
  })
})
