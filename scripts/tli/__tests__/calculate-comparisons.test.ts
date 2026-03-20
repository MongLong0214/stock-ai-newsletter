import { describe, expect, it, vi } from 'vitest'
import {
  COMPARISON_SCORE_LOOKBACK_DAYS,
  partitionPastThemesForServing,
  getComparisonScoreLookbackDate,
  prioritizeMatchesForServing,
  resolveComparisonPersistenceOutcome,
} from '@/scripts/tli/comparison/calculate-comparisons'

describe('calculate-comparisons helpers', () => {
  it('loads score history across a 365-day window for historical peak context', () => {
    expect(COMPARISON_SCORE_LOOKBACK_DAYS).toBe(365)
    expect(getComparisonScoreLookbackDate(new Date('2026-03-12T00:00:00.000Z'))).toBe('2025-03-12')
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

  it('prioritizes completed analogs ahead of active peers before truncating to top matches', () => {
    const prioritized = prioritizeMatchesForServing([
      { pastThemeId: 'peer-1', pastThemeName: 'peer-1', similarity: 0.95, currentDay: 41, pastPeakDay: 15, pastTotalDays: 40, estimatedDaysToPeak: 0, message: '', featureSim: 0.9, curveSim: 0.9, keywordSim: 0.1, isPastActive: true },
      { pastThemeId: 'completed-1', pastThemeName: 'completed-1', similarity: 0.80, currentDay: 20, pastPeakDay: 18, pastTotalDays: 40, estimatedDaysToPeak: 0, message: '', featureSim: 0.8, curveSim: 0.8, keywordSim: 0.1, isPastActive: false },
      { pastThemeId: 'completed-2', pastThemeName: 'completed-2', similarity: 0.79, currentDay: 19, pastPeakDay: 18, pastTotalDays: 40, estimatedDaysToPeak: 0, message: '', featureSim: 0.79, curveSim: 0.79, keywordSim: 0.1, isPastActive: false },
      { pastThemeId: 'peer-2', pastThemeName: 'peer-2', similarity: 0.90, currentDay: 41, pastPeakDay: 15, pastTotalDays: 40, estimatedDaysToPeak: 0, message: '', featureSim: 0.9, curveSim: 0.9, keywordSim: 0.1, isPastActive: true },
    ] as never)

    expect(prioritized.slice(0, 2).map((row) => row.pastThemeId)).toEqual([
      'completed-1',
      'completed-2',
    ])
  })

  it('partitions completed analogs ahead of active peers using point-in-time state', () => {
    const result = partitionPastThemesForServing(
      [
        { id: 'completed-1', isActive: false },
        { id: 'peer-1', isActive: true },
        { id: 'completed-2', isActive: false },
      ] as never,
      new Set(['completed-1', 'completed-2']),
    )

    expect(result.completedAnalogs.map((row) => row.id)).toEqual(['completed-1', 'completed-2'])
    expect(result.activePeers.map((row) => row.id)).toEqual(['peer-1'])
  })
})
