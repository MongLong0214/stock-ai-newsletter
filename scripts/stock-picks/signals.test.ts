import { describe, expect, it } from 'vitest'

import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { buildSignals as generatorBuildSignals } from '@/scripts/stock-picks/generate-picks'
import { buildSignals } from '@/scripts/stock-picks/signals'

const feature = (overrides: Partial<StockFeatureVector> = {}): StockFeatureVector => ({
  symbol: 'KOSPI:000001',
  simDate: '2026-09-29',
  open: 100,
  high: 101,
  low: 99,
  close: 100,
  volume: 1_000_000,
  averageTurnover20: 100_000_000,
  rsi14: 50,
  macdHistogram: 0,
  sma20: 100,
  sma60: 100,
  ema20: 100,
  sma20Slope5: 0,
  sma20DistancePercent: 0,
  atrPercent14: null,
  atrPercentile60: null,
  adx14: null,
  adx14Previous: null,
  adx14Change: null,
  obvSlope20: 0,
  volumeRatio20: 1,
  volumePercentile60: 50,
  position52w: 0.5,
  position52wObservations: 252,
  position52wFullWindow: true,
  consecutiveUpDays: 0,
  trendR2_20: 0,
  trendSlope20: 0,
  trendR2_20Previous: null,
  trendR2_20Change: null,
  trendR2_60: null,
  trendSlope60: null,
  distanceFromHigh60: 0,
  gapFromPreviousClosePercent: 0,
  goldenCrossAge: null,
  bullishCandle: null,
  ...overrides,
})

describe('observed stock signal scores', () => {
  it('preserves the generator export and seven integer score fields', () => {
    expect(generatorBuildSignals).toBe(buildSignals)
    const scores = buildSignals(feature())
    expect(scores).toEqual({
      trend_score: 50,
      momentum_score: 50,
      volume_score: 50,
      volatility_score: 50,
      pattern_score: 50,
      sentiment_score: 50,
      overall_score: 50,
    })
  })

  it('gives a precise falling trend less credit than a precise rising trend', () => {
    const up = buildSignals(feature({ trendSlope20: 0.01, trendR2_20: 1 }))
    const down = buildSignals(feature({ trendSlope20: -0.01, trendR2_20: 1 }))
    const noisyDown = buildSignals(feature({ trendSlope20: -0.01, trendR2_20: 0 }))

    expect(down.trend_score).toBeLessThan(up.trend_score)
    expect(down.trend_score).toBeLessThan(noisyDown.trend_score)
    expect(down.overall_score).toBeLessThan(up.overall_score)
  })

  it.each([null, 0])('keeps trend fit neutral without a direction (%s)', (trendSlope20) => {
    expect(buildSignals(feature({ trendSlope20, trendR2_20: 1 })).trend_score).toBe(50)
  })

  it('does not jump when an old crossover passes the event search window', () => {
    const oldCross = feature({ sma20: 103, goldenCrossAge: 60 })
    expect(buildSignals(oldCross)).toEqual(buildSignals({ ...oldCross, goldenCrossAge: null }))
  })

  it('does not reward a recent historical cross while the current averages are bearish', () => {
    const bearish = feature({ sma20: 95, sma60: 100, goldenCrossAge: 0 })
    const bullish = feature({ sma20: 105, sma60: 100, goldenCrossAge: null })

    expect(buildSignals(bearish)).toEqual(buildSignals({ ...bearish, goldenCrossAge: null }))
    expect(buildSignals(bearish).pattern_score).toBeLessThan(buildSignals(bullish).pattern_score)
  })

  it('keeps a short listing at neutral price position until all 252 observations exist', () => {
    const partialHigh = feature({ position52w: 1, position52wObservations: 80, position52wFullWindow: false })
    const partialLow = { ...partialHigh, position52w: 0 }
    const fullHigh = { ...partialHigh, position52wObservations: 252, position52wFullWindow: true }

    expect(buildSignals(partialHigh)).toEqual(buildSignals(partialLow))
    expect(buildSignals(partialHigh).pattern_score).toBe(50)
    expect(buildSignals(partialHigh).sentiment_score).toBe(50)
    expect(buildSignals(fullHigh).pattern_score).toBeGreaterThan(buildSignals(partialHigh).pattern_score)
    expect(buildSignals(fullHigh).sentiment_score).toBeGreaterThan(buildSignals(partialHigh).sentiment_score)
    expect(buildSignals({ ...partialHigh, position52wFullWindow: true })).toEqual(buildSignals(partialLow))
  })

  it('does not inflate OBV flow when only the current day becomes quiet', () => {
    // Both observations imply the same 20-day average volume of 1,000,000.
    const normal = buildSignals(feature({ obvSlope20: 100_000, volume: 1_000_000, volumeRatio20: 1 }))
    const quiet = buildSignals(feature({ obvSlope20: 100_000, volume: 100_000, volumeRatio20: 0.1 }))

    expect(quiet.volume_score).toBeLessThanOrEqual(normal.volume_score)
  })

  it('keeps volume score independent of the unit used for volumes', () => {
    const shares = feature({ obvSlope20: 100_000, volume: 1_000_000, volumeRatio20: 1.5 })
    const lots = { ...shares, obvSlope20: 1_000, volume: 10_000 }
    expect(buildSignals(shares).volume_score).toBe(buildSignals(lots).volume_score)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('handles an unusable normalization denominator (%s)', (invalid) => {
    const invalidVolume = buildSignals(feature({ volume: invalid, obvSlope20: 100_000 }))
    const missingVolume = buildSignals(feature({ volume: null, obvSlope20: 100_000 }))
    const invalidAverage = buildSignals(feature({ sma60: invalid }))
    const missingAverage = buildSignals(feature({ sma60: null }))

    expect(invalidVolume).toEqual(missingVolume)
    expect(invalidAverage).toEqual(missingAverage)
  })

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('keeps unavailable numeric observations neutral (%s)', (unavailable) => {
    const invalid = feature({
      open: unavailable,
      high: unavailable,
      low: unavailable,
      close: unavailable,
      volume: unavailable,
      rsi14: unavailable,
      macdHistogram: unavailable,
      sma20: unavailable,
      sma60: unavailable,
      sma20Slope5: unavailable,
      sma20DistancePercent: unavailable,
      atrPercent14: unavailable,
      obvSlope20: unavailable,
      volumeRatio20: unavailable,
      volumePercentile60: unavailable,
      position52w: unavailable,
      consecutiveUpDays: unavailable,
      trendR2_20: unavailable,
      trendSlope20: unavailable,
      distanceFromHigh60: unavailable,
    })
    expect(Object.values(buildSignals(invalid))).toEqual(Array(7).fill(50))
  })

  it('bounds extreme finite observations without losing integer output', () => {
    const extreme = feature({
      close: Number.MAX_VALUE,
      sma20: Number.MIN_VALUE,
      sma60: Number.MIN_VALUE,
      sma20Slope5: Number.MAX_VALUE,
      sma20DistancePercent: Number.MAX_VALUE,
      rsi14: Number.MAX_VALUE,
      macdHistogram: Number.MAX_VALUE,
      atrPercent14: Number.MAX_VALUE,
      obvSlope20: Number.MAX_VALUE,
      volumeRatio20: Number.MIN_VALUE,
      volumePercentile60: Number.MAX_VALUE,
      position52w: Number.MAX_VALUE,
      consecutiveUpDays: Number.MAX_VALUE,
      trendR2_20: Number.MAX_VALUE,
      trendSlope20: Number.MAX_VALUE,
      distanceFromHigh60: Number.MAX_VALUE,
    })
    expect(Object.values(buildSignals(extreme)).every((score) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true)
  })
})
