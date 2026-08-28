import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import { minePrecursors } from '@/scripts/stock-picks/mine-precursors'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const feature = (symbol: string, simDate: string, rsi14: number): StockFeatureVector => ({
  symbol,
  simDate,
  open: 100,
  high: 105,
  low: 95,
  close: 100,
  volume: 10_000_000,
  averageTurnover20: 500_000_000,
  rsi14,
  macdHistogram: 1,
  sma20: 100,
  sma60: 95,
  ema20: 100,
  sma20Slope5: 0.01,
  sma20DistancePercent: 0,
  atrPercent14: 3,
  atrPercentile60: 50,
  adx14: 20,
  adx14Previous: 19,
  adx14Change: 1,
  obvSlope20: 1,
  volumeRatio20: 1,
  volumePercentile60: 95,
  position52w: 0.5,
  position52wObservations: 252,
  position52wFullWindow: true,
  consecutiveUpDays: 1,
  trendR2_20: 0.5,
  trendSlope20: 0.01,
  trendR2_20Previous: 0.4,
  trendR2_20Change: 0.1,
  trendR2_60: 0.5,
  trendSlope60: 0.01,
  distanceFromHigh60: 0,
  gapFromPreviousClosePercent: 0,
  goldenCrossAge: 1,
  bullishCandle: true,
})

describe('stock-picks precursor mining', () => {
  it('detects matured +10% events and compares only signal-day features', () => {
    const dates = Array.from({ length: 12 }, (_value, index) => (
      `2026-01-${String(index + 1).padStart(2, '0')}`
    ))
    const symbol = 'KOSPI:000001'
    const rows: StockDailyPriceRow[] = dates.map((tradeDate, index) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: index === 1 ? 110 : 105,
      low: 95,
      close: 100,
      volume: 10_000_000,
      source: 'kis',
    }))
    const featuresByDate = new Map([
      [dates[0], [feature(symbol, dates[0], 80)]],
      [dates[6], [feature(symbol, dates[6], 40)]],
    ])

    const report = minePrecursors({
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(dates),
      featuresByDate,
      signalDates: [dates[0], dates[6]],
      generatedAt: '2026-08-28T00:00:00.000Z',
    })
    const rsi = report.featureRanking.find((row) => row.feature === 'rsi14')

    expect(report.samples).toEqual({
      eligibleLabeledSignalDays: 2,
      eventSignalDays: 1,
      ordinarySignalDays: 1,
      eventSymbols: 1,
    })
    expect(rsi).toMatchObject({
      eventPreviousDayMedian: 80,
      ordinaryDayMedian: 40,
      separation: 1,
      direction: 'higher_before_event',
    })
  })
})
