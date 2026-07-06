import { describe, expect, it } from 'vitest'
import { computeNextNaverSeenStreak, shouldAutoActivateTheme } from '@/scripts/tli/themes/theme-lifecycle'
import {
  findScorelessZombieThemes,
  shouldDeactivateScorelessTheme,
} from '@/scripts/tli/themes/scoreless-zombie-themes'

describe('theme lifecycle activation guards', () => {
  it('resets streak to 1 when the theme was not seen on the previous day', () => {
    expect(computeNextNaverSeenStreak({
      previousStreak: 4,
      previousSeenDate: '2026-03-10',
      currentSeenDate: '2026-03-12',
    })).toBe(1)
  })

  it('increments streak only for consecutive daily sightings', () => {
    expect(computeNextNaverSeenStreak({
      previousStreak: 1,
      previousSeenDate: '2026-03-11',
      currentSeenDate: '2026-03-12',
    })).toBe(2)
  })

  it('requires at least two consecutive sightings before auto activation', () => {
    expect(shouldAutoActivateTheme({
      isActive: false,
      discoverySource: 'naver_finance',
      naverSeenStreak: 1,
    })).toBe(false)

    expect(shouldAutoActivateTheme({
      isActive: false,
      discoverySource: 'naver_finance',
      naverSeenStreak: 2,
    })).toBe(true)
  })
})

describe('theme lifecycle scoreless zombie guards', () => {
  const today = new Date('2026-07-03T00:00:00.000Z')

  it('deactivates scoreless active themes older than 30 days', () => {
    expect(shouldDeactivateScorelessTheme({
      isActive: true,
      createdAt: '2026-06-02T00:00:00.000Z',
      hasScores: false,
      today,
      minimumAgeDays: 30,
    })).toBe(true)
  })

  it('keeps scoreless active themes younger than 30 days', () => {
    expect(shouldDeactivateScorelessTheme({
      isActive: true,
      createdAt: '2026-06-20T00:00:00.000Z',
      hasScores: false,
      today,
      minimumAgeDays: 30,
    })).toBe(false)
  })

  it('deactivates scoreless active themes exactly at the 30-day boundary (>= consistent with notSeenDays)', () => {
    expect(shouldDeactivateScorelessTheme({
      isActive: true,
      createdAt: '2026-06-03T00:00:00.000Z',
      hasScores: false,
      today,
      minimumAgeDays: 30,
    })).toBe(true)
  })

  it('keeps themes with any lifecycle score', () => {
    const candidates = findScorelessZombieThemes({
      themes: [{
        id: 'scored-theme',
        name: 'Scored Theme',
        createdAt: '2026-06-01T00:00:00.000Z',
        isActive: true,
      }],
      scoredThemeIds: new Set(['scored-theme']),
      today,
      minimumAgeDays: 30,
    })

    expect(candidates).toEqual([])
  })
})
