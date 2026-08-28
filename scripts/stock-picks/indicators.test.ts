import { describe, expect, it } from 'vitest'

import {
  adx,
  atrPercent,
  consecutiveUpDays,
  distanceFromHigh,
  ema,
  gapFromPreviousClosePercent,
  macdHistogram,
  obvSlope,
  position52w,
  rollingPercentileRank,
  sma,
  smaSlope,
  trendR2,
  volumeRatio,
  wilderRsi,
} from '@/scripts/stock-picks/indicators'

describe('stock-picks indicator golden vectors', () => {
  it('matches Wilder RSI reference value rather than standard EMA smoothing', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    ]
    expect(wilderRsi(closes, 14)).toBeCloseTo(70.464135, 6)
  })

  it('calculates SMA, seeded EMA, and level-independent SMA slope', () => {
    expect(sma([1, 2, 3, 4], 3)).toBe(3)
    expect(ema([1, 2, 3, 4], 3)).toBe(3)
    expect(smaSlope([1, 2, 4, 8], 2, 1)).toBeCloseTo(Math.log(2), 12)
  })

  it('calculates the MACD signal and histogram from seeded EMA series', () => {
    expect(macdHistogram([1, 2, 3, 4, 3], 2, 3, 2)).toBeCloseTo(-1 / 9, 12)
  })

  it('calculates Wilder ATR percent including gaps', () => {
    expect(atrPercent(
      [11, 13, 12, 15],
      [9, 10, 8, 11],
      [10, 12, 9, 14],
      3,
    )).toBeCloseTo(4 / 14 * 100, 12)
  })

  it('calculates Wilder ADX on a perfectly directional sequence', () => {
    expect(adx([10, 11, 12, 13], [8, 9, 10, 11], [9, 10, 11, 12], 2)).toBe(100)
  })

  it('calculates OBV OLS slope and current-to-average volume ratio', () => {
    expect(obvSlope([1, 2, 1, 3], [10, 20, 30, 40], 4)).toBe(6)
    expect(volumeRatio([1, 1, 1, 5], 4)).toBe(2.5)
  })

  it('uses mid-rank tie handling for rolling percentile', () => {
    expect(rollingPercentileRank([1, 3, 3, 4], 4)).toBe(0.875)
    expect(rollingPercentileRank([1, 3, 3, 3], 4)).toBe(0.625)
  })

  it('reports the available 52-week range explicitly', () => {
    expect(position52w([10, 20, 15], 5)).toEqual({
      value: 0.5,
      observations: 3,
      fullWindow: false,
    })
  })

  it('counts positive close differences rather than interpreting prices as counts', () => {
    expect(consecutiveUpDays([1, 2, 2, 3, 4])).toBe(2)
  })

  it('returns closed-form log-price trend R-squared and slope', () => {
    expect(trendR2([1, 2, 4], 3)).toEqual({
      r2: 1,
      slope: Math.log(2),
    })
  })

  it('expresses a breakout against the prior-window high as a positive percent', () => {
    expect(distanceFromHigh([80, 90, 100, 105], 3)).toBeCloseTo(5, 12)
  })

  it('calculates the signal-day opening gap from the previous close', () => {
    expect(gapFromPreviousClosePercent(100, 103)).toBeCloseTo(3, 12)
    expect(gapFromPreviousClosePercent(null, 103)).toBeNull()
  })

  it('returns null when required tail history is short or missing', () => {
    expect(wilderRsi([1, 2, 3], 3)).toBeNull()
    expect(macdHistogram([1, 2, 3], 2, 3, 2)).toBeNull()
    expect(sma([1, null, 3], 3)).toBeNull()
    expect(ema([1, 2], 3)).toBeNull()
    expect(smaSlope([1, 2, 3], 3, 1)).toBeNull()
    expect(atrPercent([2, 3], [1, 2], [1.5, 2.5], 3)).toBeNull()
    expect(adx([1, 2, 3], [1, 1, 2], [1, 2, 3], 2)).toBeNull()
    expect(obvSlope([1, 2], [10, 20], 3)).toBeNull()
    expect(volumeRatio([1, 2], 3)).toBeNull()
    expect(rollingPercentileRank([1, 2], 3)).toBeNull()
    expect(position52w([1], 252).value).toBeNull()
    expect(consecutiveUpDays([1])).toBeNull()
    expect(trendR2([1, 2], 3)).toBeNull()
    expect(distanceFromHigh([1, 2, null, 3], 3)).toBeNull()
    expect(gapFromPreviousClosePercent(0, 3)).toBeNull()
  })
})
