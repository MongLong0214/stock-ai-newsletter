import { describe, expect, it } from 'vitest'
import { buildPriceBook, StockDataHandler } from '@/scripts/stock-picks/data-handler'
import { buildTechnicalContextMap } from '@/scripts/stock-picks/technical-context'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import { KOSPI_INDEX_SYMBOL, type StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const dates = Array.from({ length: 62 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
const rows = (symbol: string, slope: number): StockDailyPriceRow[] => dates.map((date, i) => ({
  symbol, trade_date: date, open: 100 + slope * i, close: 102 + slope * i,
  high: 103 + slope * i, low: 99 + slope * i, volume: 1_000, source: 'kis',
}))
const calculate = (data: StockDailyPriceRow[], inputDates = dates) => buildTechnicalContextMap({
  handler: new StockDataHandler(buildPriceBook(data), new TradingDayIndex(dates)).at(inputDates.at(-1)!),
  symbols: ['A', 'B'], dates: inputDates, includeFromDate: inputDates.at(-1),
}).get(inputDates.at(-1)!)!

describe('technical context data', () => {
  it('computes independent CMF, candle, benchmark-relative and breadth values', () => {
    const map = calculate([...rows('A', 1), ...rows('B', -1), ...rows(KOSPI_INDEX_SYMBOL, 0)])
    const context = map.get('A')!
    expect(context.chaikinMoneyFlow21).toBeCloseTo(0.5)
    expect(context.closeLocation).toBeCloseTo(0.75)
    expect(context.upperWickRatio).toBeCloseTo(0.25)
    expect(context.return20Percent).toBeCloseTo((163 / 143 - 1) * 100)
    expect(context.relativeReturn20PercentagePoints).toBeCloseTo(context.return20Percent!)
    expect(context.benchmarkReturn20Percent).toBe(0)
    expect(context.distanceFromPriorHigh20Percent).toBe(0)
    expect(context.breadthAboveSma20).toBe(0.5)
    expect(context.breadthEligibleSymbols).toBe(2)
    // 20 consecutive integers have population variance (20^2-1)/12.
    expect(context.bollingerWidth20Percent).toBeCloseTo(4 * Math.sqrt(399 / 12) / 153.5 * 100)
    expect(context.realizedVolatility20Percent).toBeGreaterThan(0)
  })

  it('does not bridge missing or untraded rows, and reports breadth coverage', () => {
    const data = [...rows('A', 1), ...rows('B', -1)].map((row) => (
      row.symbol === 'A' && row.trade_date === dates.at(-10) ? { ...row, volume: 0 } : row
    ))
    const context = calculate(data).get('A')!
    expect(context.chaikinMoneyFlow21).toBeNull()
    expect(context.return20Percent).toBeNull()
    expect(context.bollingerWidth20Percent).toBeNull()
    expect(context.relativeReturn20PercentagePoints).toBeNull()
    expect(context.benchmarkReturn20Percent).toBeNull()
    expect(context.breadthEligibleSymbols).toBe(1)
    expect(context.breadthUniverseSymbols).toBe(2)
    expect(context.breadthAboveSma20).toBe(0)
  })

  it('cannot change a historical observation by changing later prices', () => {
    const data = [...rows('A', 1), ...rows('B', -1), ...rows(KOSPI_INDEX_SYMBOL, 0)]
    const run = (prices: StockDailyPriceRow[]) => buildTechnicalContextMap({
      handler: new StockDataHandler(buildPriceBook(prices), new TradingDayIndex(dates)).at(dates.at(-1)!),
      symbols: ['A', 'B'], dates, includeFromDate: dates.at(-2),
    }).get(dates.at(-2)!)
    const changed = data.map((row) => row.trade_date === dates.at(-1)
      ? { ...row, open: 9999, high: 9999, low: 9999, close: 9999 } : row)
    expect(run(changed)).toEqual(run(data))
    expect(calculate(data, dates.slice(0, -1))).toEqual(run(data))
  })

  it('handles zero-range candles without NaN and never invents early history', () => {
    const data = rows('A', 0).map((row) => ({ ...row, open: 100, high: 100, low: 100, close: 100 }))
    const context = calculate(data).get('A')!
    expect(context.closeLocation).toBeNull()
    expect(context.upperWickRatio).toBeNull()
    expect(context.chaikinMoneyFlow21).toBe(0)
    expect(context.bollingerWidth20Percent).toBe(0)
    expect(context.realizedVolatility20Percent).toBe(0)
    expect(calculate(data, dates.slice(0, 5)).get('A')!.return5Percent).toBeNull()
  })
})
