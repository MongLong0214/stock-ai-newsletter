import { describe, expect, it, vi } from 'vitest'
import {
  COMPARISON_SCORE_LOOKBACK_DAYS,
  deleteStaleLegacyComparisons,
  getComparisonScoreLookbackDate,
  resolveComparisonPersistenceOutcome,
} from '../calculate-comparisons'

describe('calculate-comparisons helpers', () => {
  it('loads score history across a 365-day window for historical peak context', () => {
    expect(COMPARISON_SCORE_LOOKBACK_DAYS).toBe(365)
    expect(getComparisonScoreLookbackDate(new Date('2026-03-12T00:00:00.000Z'))).toBe('2025-03-12')
  })

  it('falls back to stale-date-only cleanup when legacy table has no outcome_verified column', async () => {
    const firstSelect = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'column theme_comparisons.outcome_verified does not exist' },
    })
    const secondSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'legacy-1' }],
      error: null,
    })

    const firstDeleteChain = {
      lt: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          select: firstSelect,
        }),
      }),
    }
    const secondDeleteChain = {
      lt: vi.fn().mockReturnValue({
        select: secondSelect,
      }),
    }

    const client = {
      from: vi.fn()
        .mockReturnValueOnce({ delete: vi.fn().mockReturnValue(firstDeleteChain) })
        .mockReturnValueOnce({ delete: vi.fn().mockReturnValue(secondDeleteChain) }),
    }

    const result = await deleteStaleLegacyComparisons(
      client as never,
      '2026-03-12',
      90,
    )

    expect(result.deletedCount).toBe(1)
    expect(result.usedSchemaFallback).toBe(true)
    expect(client.from).toHaveBeenCalledTimes(2)
    expect(secondSelect).toHaveBeenCalledWith('id')
  })

  it('treats V4 write failure as a failed persistence outcome instead of a successful match count', () => {
    expect(resolveComparisonPersistenceOutcome({ attemptedMatches: 3, writeSucceeded: false })).toEqual({
      persistedMatchCount: 0,
      persistedTheme: false,
    })
    expect(resolveComparisonPersistenceOutcome({ attemptedMatches: 3, writeSucceeded: true })).toEqual({
      persistedMatchCount: 3,
      persistedTheme: true,
    })
  })
})
