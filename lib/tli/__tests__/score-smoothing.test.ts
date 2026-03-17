import { afterEach, describe, expect, it } from 'vitest'
import { applyEMASmoothing, resolveStageWithHysteresis, computeAlpha } from '@/lib/tli/score-smoothing'
import type { InterestMetric, ScoreComponents } from '@/lib/tli/types'
import { setTLIParams } from '@/lib/tli/constants/tli-params'

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

// ---------------------------------------------------------------------------
// T7: Cautious Decay — applyEMASmoothing tests
// ---------------------------------------------------------------------------

describe('applyEMASmoothing — Cautious Decay', () => {
  afterEach(() => {
    setTLIParams() // restore defaults
  })

  const prev = 80
  const recentSmoothed = [78, 79, 80, 81, 80] // sigma ~ 1, maxDailyChange = 10

  // 1. All 3 signals confirm decline -> no protection, rawScore passes through
  it('no decay protection when 3/3 signals confirm decline', () => {
    const components = makeComponents({
      interest_slope: -5,          // < 0 => true
      news_this_week: 3,           // < news_last_week(8) => true
      dvi: 0.2,                    // < 0.4 => true
    })
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // Step A: confirmCount=3 >= 2 => effectiveRaw = 60
    // Step B: |60-80|=20 > 10 => clamped to 80 - 10 = 70
    // Step C: EMA = round(0.4*70 + 0.6*80) = round(76) = 76
    expect(result).toBe(76)
  })

  // 2. 2/3 signals confirm -> no protection
  it('no decay protection when 2/3 signals confirm decline', () => {
    const components = makeComponents({
      interest_slope: -3,          // < 0 => true
      news_this_week: 5,           // < news_last_week(8) => true
      dvi: 0.5,                    // >= 0.4 => false
    })
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // confirmCount=2 >= 2 => effectiveRaw = 60
    // Bollinger: clamped to 70
    // EMA: round(0.4*70 + 0.6*80) = 76
    expect(result).toBe(76)
  })

  // 3. 1/3 signals confirm -> cautious floor applies
  it('cautious floor applied when 1/3 signals confirm', () => {
    const components = makeComponents({
      interest_slope: -2,          // < 0 => true
      news_this_week: 10,          // >= news_last_week(8) => false
      dvi: 0.5,                    // >= 0.4 => false
    })
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // confirmCount=1 < 2 => floor = 80 * 0.90 = 72
    // effectiveRaw = max(60, 72) = 72
    // Bollinger: |72-80|=8 <= 10 => no clamp
    // EMA: round(0.4*72 + 0.6*80) = round(76.8) = 77
    expect(result).toBe(77)
  })

  // 4. 0/3 signals -> all neutral -> floor applies
  it('cautious floor applied when 0/3 signals confirm (all neutral)', () => {
    const components = makeComponents({
      interest_slope: 2,           // >= 0 => false
      news_this_week: 12,          // >= news_last_week(8) => false
      dvi: 0.6,                    // >= 0.4 => false
    })
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // confirmCount=0 < 2 => floor = 80 * 0.90 = 72
    // effectiveRaw = max(60, 72) = 72
    // Bollinger: |72-80|=8 <= 10 => no clamp
    // EMA: round(0.4*72 + 0.6*80) = round(76.8) = 77
    expect(result).toBe(77)
  })

  // 5. Score increase -> bypass cautious decay entirely
  it('no protection on score increase', () => {
    const components = makeComponents({
      interest_slope: -5,
      news_this_week: 3,
      dvi: 0.2,
    })
    const raw = 90 // > prev(80)
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // raw > prev => skip Step A
    // Bollinger: |90-80|=10 <= 10 => no clamp, effectiveRaw=90
    // EMA: round(0.4*90 + 0.6*80) = round(84) = 84
    expect(result).toBe(84)
  })

  // 6. Cautious floor never exceeds prevSmoothedScore
  it('cautious floor does not exceed prevSmoothedScore', () => {
    const components = makeComponents({
      interest_slope: 0,           // >= 0 => false
      news_this_week: 12,          // >= news_last_week(8) => false
      dvi: 0.6,                    // >= 0.4 => false
    })
    // raw = 75 < prev = 80; floor = 80 * 0.90 = 72
    // effectiveRaw = max(75, 72) = 75 (raw is already above floor)
    const raw = 75
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // Bollinger: |75-80|=5 <= 10 => no clamp
    // EMA: round(0.4*75 + 0.6*80) = round(78) = 78
    expect(result).toBe(78)
    // Verify floor (72) < prev (80)
    expect(prev * 0.90).toBeLessThan(prev)
  })

  // 7. Step A before Step B: floor then Bollinger clamp
  it('Step A before Step B: floor then Bollinger clamp', () => {
    const components = makeComponents({
      interest_slope: 1,           // >= 0 => false
      news_this_week: 12,          // >= 8 => false
      dvi: 0.6,                    // >= 0.4 => false
    })
    // Use very low raw to trigger both floor AND Bollinger clamp
    const raw = 30
    const highPrev = 90
    const result = applyEMASmoothing(raw, highPrev, recentSmoothed, { components })
    // Step A: confirmCount=0 < 2 => floor = 90*0.90 = 81
    //   effectiveRaw = max(30, 81) = 81
    // Step B: |81-90|=9 <= 10 => no clamp (floor already limits the drop)
    // EMA: round(0.4*81 + 0.6*90) = round(86.4) = 86
    expect(result).toBe(86)
  })

  // 8. components undefined -> falls back to no protection (backward compat)
  it('components undefined falls back to no protection', () => {
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed)
    // No options => no Step A protection
    // Bollinger: |60-80|=20 > 10 => clamped to 70
    // EMA: round(0.4*70 + 0.6*80) = 76
    expect(result).toBe(76)
  })

  // 9. dvi undefined treated as decline unconfirmed (false)
  it('dvi undefined treated as decline unconfirmed', () => {
    const components = makeComponents({
      interest_slope: -5,          // < 0 => true
      news_this_week: 3,           // < 8 => true
      // dvi not set => undefined => ?? 0.5 => 0.5 >= 0.4 => false
    })
    // Remove dvi explicitly
    delete (components.raw as Record<string, unknown>).dvi
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // signals: [true, true, false] => confirmCount=2 >= 2 => no protection
    // Bollinger: clamped to 70
    // EMA: 76
    expect(result).toBe(76)
  })

  // 10. interest_slope undefined treated as decline unconfirmed (false)
  it('interest_slope undefined treated as decline unconfirmed', () => {
    const components = makeComponents({
      // interest_slope not set => undefined => ?? 0 => 0 < 0 => false
      news_this_week: 3,           // < 8 => true
      dvi: 0.2,                    // < 0.4 => true
    })
    // Remove interest_slope explicitly
    delete (components.raw as Record<string, unknown>).interest_slope
    const raw = 60
    const result = applyEMASmoothing(raw, prev, recentSmoothed, { components })
    // signals: [false, true, true] => confirmCount=2 >= 2 => no protection
    // Bollinger: clamped to 70
    // EMA: 76
    expect(result).toBe(76)
  })
})

// ---------------------------------------------------------------------------
// T8: EMA Momentum Scheduling — computeAlpha tests
// ---------------------------------------------------------------------------

describe('computeAlpha — EMA Momentum Scheduling', () => {
  it('returns 0.6 for day 0', () => {
    expect(computeAlpha('2026-03-17', '2026-03-17')).toBeCloseTo(0.6, 2)
  })

  it('returns 0.45 for day 15', () => {
    expect(computeAlpha('2026-03-02', '2026-03-17')).toBeCloseTo(0.45, 2)
  })

  it('returns 0.3 for day 30', () => {
    expect(computeAlpha('2026-02-15', '2026-03-17')).toBeCloseTo(0.3, 2)
  })

  it('returns 0.3 for day 60 (clamp)', () => {
    expect(computeAlpha('2026-01-16', '2026-03-17')).toBeCloseTo(0.3, 2)
  })

  it('returns 0.4 for null firstSpikeDate', () => {
    expect(computeAlpha(null, '2026-03-17')).toBe(0.4)
  })

  it('applyEMASmoothing uses computed alpha for young theme (day 0)', () => {
    const raw = 90
    const prev = 80
    const recent = [78, 79, 80]
    // alpha = 0.6 for day 0
    const result = applyEMASmoothing(raw, prev, recent, {
      firstSpikeDate: '2026-03-17',
      today: '2026-03-17',
    })
    // Bollinger: |90-80|=10 <= max(10, 2*sigma) => no clamp
    // EMA: round(0.6*90 + 0.4*80) = round(86) = 86
    expect(result).toBe(86)
  })

  it('applyEMASmoothing without dates uses default alpha 0.4', () => {
    const raw = 90
    const prev = 80
    const recent = [78, 79, 80]
    const result = applyEMASmoothing(raw, prev, recent)
    // No options => alpha = EMA_ALPHA = 0.4
    // EMA: round(0.4*90 + 0.6*80) = round(84) = 84
    expect(result).toBe(84)
  })
})
