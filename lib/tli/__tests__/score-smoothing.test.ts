import { describe, expect, it } from 'vitest'
import { resolveStageWithHysteresis } from '@/lib/tli/score-smoothing'
import type { InterestMetric, ScoreComponents } from '@/lib/tli/types'

function makeComponents(rawOverrides: Partial<ScoreComponents['raw']> = {}): ScoreComponents {
  return {
    interest_score: 0.5,
    news_momentum: 0.5,
    volatility_score: 0.5,
    maturity_ratio: 0.5,
    activity_score: 0.3,
    weights: { interest: 0.40, news: 0.35, volatility: 0.10, activity: 0.15 },
    raw: {
      recent_7d_avg: 50,
      baseline_30d_avg: 40,
      news_this_week: 50,
      news_last_week: 8,
      interest_stddev: 5,
      active_days: 30,
      interest_slope: 0,
      level_score: 0.5,
      raw_score: 0.8,
      ...rawOverrides,
    },
  }
}

function makeMetrics(): InterestMetric[] {
  return Array.from({ length: 14 }, (_, index) => ({
    id: `m-${index}`,
    theme_id: 'theme-1',
    time: `2026-03-${String(index + 1).padStart(2, '0')}`,
    source: 'naver',
    raw_value: 100,
    normalized: 50,
  }))
}

describe('resolveStageWithHysteresis', () => {
  it('fast-tracks strong Decline rebounds into Growth', () => {
    const result = resolveStageWithHysteresis({
      rawScore: 80,
      smoothedScore: 72,
      components: makeComponents(),
      prevStage: 'Decline',
      prevCandidate: undefined,
      prevCalculatedAt: '2026-03-13',
      today: '2026-03-14',
      interestMetrics14d: makeMetrics(),
    })

    expect(result.finalStage).toBe('Growth')
    expect(result.isReigniting).toBe(true)
    expect(result.stageChanged).toBe(true)
  })
})
