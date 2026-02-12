import { describe, it, expect } from 'vitest'
import { determineStage } from '@/lib/tli/stage'
import type { ScoreComponents } from '@/lib/tli/types'

function makeComponents(overrides: Partial<ScoreComponents> = {}): ScoreComponents {
  return {
    interest_score: 0.5,
    news_momentum: 0.5,
    volatility_score: 0.5,
    maturity_ratio: 0.5,
    weights: { interest: 0.5, news: 0.3, volatility: 0.2 },
    raw: {
      recent_7d_avg: 50, baseline_30d_avg: 40,
      news_this_week: 10, news_last_week: 8,
      interest_stddev: 5, active_days: 30,
    },
    ...overrides,
  }
}

describe('determineStage', () => {
  it('returns Peak for score >= 80', () => {
    expect(determineStage(80, makeComponents())).toBe('Peak')
    expect(determineStage(95, makeComponents())).toBe('Peak')
  })

  it('returns Peak for score >= 60 with high interest + news', () => {
    const c = makeComponents({ interest_score: 0.9, news_momentum: 0.8 })
    expect(determineStage(65, c)).toBe('Peak')
  })

  it('returns Growth for score >= 60 without peak conditions', () => {
    const c = makeComponents({ interest_score: 0.5, news_momentum: 0.5 })
    expect(determineStage(60, c)).toBe('Growth')
    expect(determineStage(79, c)).toBe('Growth')
  })

  it('returns Early for score 40-59', () => {
    expect(determineStage(40, makeComponents())).toBe('Early')
    expect(determineStage(59, makeComponents())).toBe('Early')
  })

  it('returns Decay for score 20-39', () => {
    expect(determineStage(20, makeComponents())).toBe('Decay')
    expect(determineStage(39, makeComponents())).toBe('Decay')
  })

  it('returns Decay for score >= 10 with high maturity + low interest', () => {
    const c = makeComponents({ maturity_ratio: 0.9, interest_score: 0.2 })
    expect(determineStage(15, c)).toBe('Decay')
  })

  it('returns Dormant for score < 20 without decay conditions', () => {
    const c = makeComponents({ maturity_ratio: 0.3, interest_score: 0.5 })
    expect(determineStage(10, c)).toBe('Dormant')
    expect(determineStage(0, c)).toBe('Dormant')
  })
})
