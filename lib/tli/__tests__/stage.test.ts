import { describe, it, expect } from 'vitest'
import { determineStage, isReignitingTransition } from '@/lib/tli/stage'
import type { ScoreComponents } from '@/lib/tli/types'
import type { TLIParams } from '@/lib/tli/constants/tli-params'

/** v2 ScoreComponents 기본값 — stable trend (slope=0) */
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
      news_this_week: 10,
      news_last_week: 8,
      interest_stddev: 5,
      active_days: 30,
      interest_slope: 0,
      level_score: 0.5,
      raw_score: 0.5,
      ...rawOverrides,
    },
  }
}

describe('determineStage (v2 Multi-Signal + Markov)', () => {
  // ── Multi-Signal 우선순위 판정 ──

  it('returns Dormant for score < 10 with stable trend', () => {
    expect(determineStage(8, makeComponents())).toBe('Dormant')
    expect(determineStage(0, makeComponents())).toBe('Dormant')
  })

  it('returns Emerging for score < 10 with rising trend', () => {
    // slope=10, recent_7d_avg=50 → normalizedSlope=0.2 > 0.10 → rising
    const c = makeComponents({ interest_slope: 10 })
    expect(determineStage(8, c)).toBe('Emerging')
  })

  it('returns Peak for score >= 71', () => {
    expect(determineStage(75, makeComponents())).toBe('Peak')
    expect(determineStage(95, makeComponents())).toBe('Peak')
  })

  it('returns Growth (not Peak) for score in [61, 71) range', () => {
    expect(determineStage(63, makeComponents())).toBe('Growth')
    expect(determineStage(70, makeComponents())).toBe('Growth')
  })

  it('returns Peak for score >= 50 with high news volume and stable trend', () => {
    const c = makeComponents({ news_this_week: 50 })
    expect(determineStage(50, c)).toBe('Peak')
  })

  it('returns Decline for falling trend + rawScore drop + low news', () => {
    // slope=-10, recent_7d_avg=50 → normalizedSlope=-0.2 → falling
    // raw_score=0.3 < 0.85 * level_score(0.5) = 0.425 → decline trigger
    // news_this_week=5 < 30 → confirmed
    const c = makeComponents({
      interest_slope: -10,
      raw_score: 0.3,
      level_score: 0.5,
      news_this_week: 5,
    })
    expect(determineStage(30, c)).toBe('Decline')
  })

  it('returns Growth for score >= 40 with stable trend', () => {
    expect(determineStage(40, makeComponents())).toBe('Growth')
    expect(determineStage(60, makeComponents())).toBe('Growth')
  })

  it('returns Emerging for mid-range score below Growth threshold', () => {
    expect(determineStage(30, makeComponents())).toBe('Emerging')
  })

  // ── Markov 전이 제약 ──

  it('blocks disallowed transitions (Dormant → Peak)', () => {
    expect(determineStage(80, makeComponents(), 'Dormant')).toBe('Dormant')
  })

  it('blocks disallowed transitions (Emerging → Peak)', () => {
    expect(determineStage(80, makeComponents(), 'Emerging')).toBe('Emerging')
  })

  it('allows valid transitions (Growth → Peak)', () => {
    expect(determineStage(80, makeComponents(), 'Growth')).toBe('Peak')
  })

  it('allows valid transitions (Decline → Growth)', () => {
    expect(determineStage(60, makeComponents(), 'Decline')).toBe('Growth')
  })

  it('clamps rapid Decline → Peak rebounds to Growth instead of keeping Decline', () => {
    expect(determineStage(80, makeComponents(), 'Decline')).toBe('Growth')
  })

  it('relaxes Markov constraints on data gap >= 3 days', () => {
    expect(determineStage(80, makeComponents(), 'Dormant', 3)).toBe('Peak')
  })

  it('marks Decline → Growth as a reigniting transition', () => {
    expect(isReignitingTransition('Growth', 'Decline')).toBe(true)
  })

  it('with custom thresholds via config: dormant=20 makes score=15 Emerging', () => {
    // Default dormant=10 → score=18 is NOT < 10 → not Dormant → Emerging
    // With dormant=20 → score=18 IS < 20 + stable trend → Dormant
    const config: Partial<TLIParams> = { stage_dormant: 20 }
    const resultDefault = determineStage(18, makeComponents())
    const resultConfig = determineStage(18, makeComponents(), undefined, undefined, config)

    expect(resultDefault).toBe('Emerging') // score=18 > 10 default dormant
    expect(resultConfig).toBe('Dormant')   // score=18 < 20 custom dormant
  })

  it('config replaces legacy thresholds param', () => {
    // config로 stage_dormant=20 전달 → 15점은 score < 20 → Dormant
    const config: Partial<TLIParams> = { stage_dormant: 20, stage_emerging: 40, stage_growth: 58, stage_peak: 68 }
    expect(determineStage(18, makeComponents(), undefined, undefined, config)).toBe('Dormant')
  })
})
