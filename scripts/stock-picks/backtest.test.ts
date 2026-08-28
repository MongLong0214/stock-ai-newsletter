import { describe, expect, it, vi } from 'vitest'

import { runBacktest, type StockPickStrategy } from '@/scripts/stock-picks/backtest'
import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

describe('stock-picks backtest harness', () => {
  it('runs one walk-forward iteration over a three-trading-day mini fixture', () => {
    const dates = ['2026-01-02', '2026-01-05', '2026-01-06']
    const universe = ['KOSPI:000001', 'KOSPI:000002', 'KOSPI:000003']
    const rows: StockDailyPriceRow[] = universe.flatMap((symbol) => dates.map((tradeDate) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
      source: 'kis',
    })))
    const strategy = vi.fn<StockPickStrategy>((_handler, symbols) => [...symbols].slice(0, 3))

    const report = runBacktest({
      strategyName: 'fixture3',
      strategy,
      universe,
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(dates),
      startDate: dates[0],
      endDate: dates[0],
    })

    expect(strategy).toHaveBeenCalledOnce()
    expect(report).toMatchObject({
      strategy: 'fixture3',
      totalDates: 1,
      totalPicks: 3,
      labeledPicks: 0,
      nullPicks: 3,
      precisionAt3: null,
      nullRate: 1,
    })
    expect(report.daily).toHaveLength(1)
  })
})
