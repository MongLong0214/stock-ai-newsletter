import { describe, expect, it } from 'vitest'

import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildFeatureSeries, buildFeatureVector } from '@/scripts/stock-picks/features'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const dates = Array.from({ length: 70 }, (_value, index) => `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`)
const symbol = 'KOSPI:000001'

const buildRows = (missingLastVolume = false): StockDailyPriceRow[] => dates.map((tradeDate, index) => ({
  symbol,
  trade_date: tradeDate,
  open: 1_000 + index,
  high: 1_020 + index,
  low: 990 + index,
  close: 1_010 + index,
  volume: missingLastVolume && index === dates.length - 1 ? null : 1_000,
  source: 'kis',
}))

describe('stock-picks feature builder', () => {
  it('builds symbol-by-date features through the guarded handler', () => {
    const tradingDays = new TradingDayIndex(dates)
    const handler = new StockDataHandler(buildPriceBook(buildRows()), tradingDays).at(dates.at(-1)!)
    const feature = buildFeatureVector(handler, symbol)

    expect(feature).toMatchObject({
      symbol,
      simDate: dates.at(-1),
      close: 1_079,
      volume: 1_000,
      bullishCandle: true,
      position52wObservations: 70,
      position52wFullWindow: false,
    })
    expect(feature.gapFromPreviousClosePercent).toBeCloseTo(-9 / 1_078 * 100, 12)
    expect(feature.averageTurnover20).toBe(1_069_500)
    expect(feature.trendSlope60).toBeGreaterThan(0)
    expect(feature.rsi14).toBe(100)
  })

  it('keeps missing liquidity as null instead of replacing it with zero', () => {
    const tradingDays = new TradingDayIndex(dates)
    const handler = new StockDataHandler(buildPriceBook(buildRows(true)), tradingDays).at(dates.at(-1)!)
    const feature = buildFeatureVector(handler, symbol)

    expect(feature.volume).toBeNull()
    expect(feature.averageTurnover20).toBeNull()
    expect(feature.volumeRatio20).toBeNull()
  })

  it('loads each symbol-date row once and emits only requested post-warmup dates', () => {
    const tradingDays = new TradingDayIndex(dates)
    const guarded = new StockDataHandler(buildPriceBook(buildRows()), tradingDays).at(dates.at(-1)!)
    let reads = 0
    const handler = {
      ...guarded,
      get: (rowSymbol: string, date: string) => {
        reads++
        return guarded.get(rowSymbol, date)
      },
    }
    const output = buildFeatureSeries({
      handler,
      symbol,
      dates,
      includeFromDate: dates.at(-2),
    })

    expect(reads).toBe(dates.length)
    expect(output.map((row) => row.simDate)).toEqual(dates.slice(-2))
  })
})
