import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  PARAMETER_GRIDS,
  createWalkForwardSplits,
  runWalkForwardOptimization,
  type WalkForwardSplit,
} from '@/scripts/stock-picks/optimize'
import {
  DEFAULT_COMPOSITE_PARAMETERS,
  DEFAULT_EARLY_TREND_PARAMETERS,
  DEFAULT_PULLBACK_REBOUND_PARAMETERS,
  DEFAULT_VOLUME_BREAKOUT_PARAMETERS,
  type StockMasterState,
} from '@/scripts/stock-picks/strategies'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const makeFeature = (symbol: string, simDate: string): StockFeatureVector => ({
  symbol,
  simDate,
  open: 1_900,
  high: 2_050,
  low: 1_850,
  close: 2_000,
  volume: 1_000_000,
  averageTurnover20: 2_000_000_000,
  rsi14: 45,
  macdHistogram: 1,
  sma20: 1_990,
  sma60: 1_800,
  ema20: 1_990,
  sma20Slope5: 0.01,
  sma20DistancePercent: 0.5,
  atrPercent14: 3,
  adx14: 25,
  adx14Previous: 24,
  adx14Change: 1,
  obvSlope20: 100,
  volumeRatio20: 1.2,
  volumePercentile60: 99,
  position52w: 0.8,
  position52wObservations: 100,
  position52wFullWindow: false,
  consecutiveUpDays: 1,
  trendR2_20: 0.6,
  trendSlope20: 0.01,
  trendR2_20Previous: 0.55,
  trendR2_20Change: 0.05,
  trendR2_60: 0.8,
  trendSlope60: 0.01,
  distanceFromHigh60: 1,
  goldenCrossAge: 2,
  bullishCandle: true,
})

describe('stock-picks walk-forward optimizer', () => {
  it('purges the final five train trading days before the test label boundary', () => {
    const dates = [
      ...Array.from({ length: 8 }, (_value, index) => `2026-01-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-02-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-03-${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_value, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
    ]
    const tradingDays = new TradingDayIndex(dates)
    const [split] = createWalkForwardSplits(dates)

    expect(split.purgedDates).toEqual(dates.slice(19, 24))
    expect(split.trainDates.at(-1)).toBe(dates[18])
    const trainLastLabelDay = tradingDays.nextTradingDay(split.trainDates.at(-1)!, 5)
    expect(trainLastLabelDay !== null && trainLastLabelDay < split.testDates[0]).toBe(true)
  })

  it('keeps every default strategy grid at or below 200 combinations', () => {
    for (const grid of Object.values(PARAMETER_GRIDS)) expect(grid.length).toBeLessThanOrEqual(200)
  })

  it('runs one full train-select then OOS-test fixture iteration deterministically', () => {
    const evaluationDates = [
      '2026-01-02', '2026-01-05',
      '2026-02-02', '2026-02-03',
      '2026-03-02', '2026-03-03',
      '2026-04-01', '2026-04-02',
    ]
    const futureDates = ['2026-04-03', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09']
    const allDates = [...evaluationDates, ...futureDates]
    const symbols = ['KOSPI:000001', 'KOSPI:000002', 'KOSPI:000003']
    const rows: StockDailyPriceRow[] = symbols.flatMap((symbol) => allDates.map((tradeDate) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: 111,
      low: 95,
      close: 105,
      volume: 1_000,
      source: 'kis',
    })))
    const masters: StockMasterState[] = symbols.map((symbol) => ({
      symbol,
      is_active: true,
      status_flags: {},
    }))
    const featuresByDate = new Map(evaluationDates.map((date) => [
      date,
      symbols.map((symbol) => makeFeature(symbol, date)),
    ]))
    const split: WalkForwardSplit = {
      index: 0,
      trainMonths: ['2026-01', '2026-02', '2026-03'],
      testMonths: ['2026-04'],
      trainDates: evaluationDates.slice(0, 5),
      purgedDates: [evaluationDates[5]],
      testDates: evaluationDates.slice(6),
    }
    const parameterGrids = {
      pullbackRebound: [DEFAULT_PULLBACK_REBOUND_PARAMETERS],
      volumeBreakout: [DEFAULT_VOLUME_BREAKOUT_PARAMETERS],
      earlyTrend: [DEFAULT_EARLY_TREND_PARAMETERS],
      composite: [DEFAULT_COMPOSITE_PARAMETERS],
    }
    const input = {
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(allDates),
      masters,
      featuresByDate,
      splits: [split],
      parameterGrids,
      generatedAt: '2026-08-28T00:00:00.000Z',
    }

    const first = runWalkForwardOptimization(input)
    const second = runWalkForwardOptimization(input)
    expect(first).toEqual(second)
    expect(first.strategies.composite.force3.aggregate).toMatchObject({
      evaluationScope: 'out_of_sample',
      totalDates: 2,
      totalPicks: 6,
      labeledPicks: 6,
      precisionAt3: 1,
      nullRate: 0,
    })
    expect(first.strategies.composite.force3.segments[0].train.inSampleReference.precisionAt3).toBe(1)
    expect(first.compositeAblation.evaluationScope).toBe('out_of_sample')
    expect(first.caveats.survivorshipBias).toContain('current stock_master')
  })
})
