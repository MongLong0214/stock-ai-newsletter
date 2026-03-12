import { describe, expect, it } from 'vitest'
import { computeNextNaverSeenStreak, shouldAutoActivateTheme } from '../theme-lifecycle'

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
