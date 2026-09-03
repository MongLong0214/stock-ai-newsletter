import { describe, expect, it, vi } from 'vitest'

import {
  createPolicyRandomStrategy,
  movingBlockBootstrapCi,
  pairedDailyDelta,
  runBacktest,
  type StockPickStrategy,
} from '@/scripts/stock-picks/backtest'
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
      slotPrecisionAt3: 0,
      slotCoverage: 1,
      anyHitRate: 0,
      twoPlusHitRate: 0,
      dailyHits: [0],
      nullRate: 1,
    })
    expect(report.daily).toHaveLength(1)
    expect(report.daily[0]).toMatchObject({
      slotCount: 3,
      hits: 0,
      filledSlots: 3,
      unfilledSlots: 0,
      nullLabelSlots: 3,
    })
  })

  it('counts unfilled and null-label slots as product misses while preserving conditional precision', () => {
    const dates = [
      '2026-01-02', '2026-01-05', '2026-01-06',
      '2026-01-07', '2026-01-08', '2026-01-09',
    ]
    const symbols = ['KOSPI:000001', 'KOSPI:000002']
    const rows: StockDailyPriceRow[] = symbols.flatMap((symbol, symbolIndex) => dates.map((tradeDate, index) => ({
      symbol,
      trade_date: tradeDate,
      open: 100,
      high: symbolIndex === 0 && index === 1 ? 110 : 105,
      low: 95,
      close: 100,
      volume: 1_000,
      source: 'kis',
    })))
    const strategy: StockPickStrategy = () => symbols

    const report = runBacktest({
      strategyName: 'two-picks',
      strategy,
      universe: symbols,
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(dates),
      startDate: dates[0],
      endDate: dates[0],
    })

    expect(report.precisionAt3).toBe(0.5)
    expect(report.slotPrecisionAt3).toBeCloseTo(1 / 3)
    expect(report.slotCoverage).toBeCloseTo(2 / 3)
    expect(report.anyHitRate).toBe(1)
    expect(report.twoPlusHitRate).toBe(0)
    expect(report.daily[0]).toMatchObject({
      hits: 1,
      filledSlots: 2,
      unfilledSlots: 1,
      nullLabelSlots: 0,
    })
  })

  it('counts data errors as slot misses but excludes them from conditional precision', () => {
    const dates = [
      '2026-01-02', '2026-01-05', '2026-01-06',
      '2026-01-07', '2026-01-08', '2026-01-09',
    ]
    const symbols = ['KOSPI:000001', 'KOSPI:000002']
    const rows: StockDailyPriceRow[] = symbols.flatMap((symbol) => dates.flatMap((tradeDate, index) => {
      if (symbol === symbols[0] && index === 1) return []
      return [{
        symbol,
        trade_date: tradeDate,
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1_000,
        source: 'kis' as const,
      }]
    }))

    const report = runBacktest({
      strategyName: 'data-error',
      strategy: () => symbols,
      universe: symbols,
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(dates),
      startDate: dates[0],
      endDate: dates[0],
    })

    expect(report.precisionAt3).toBe(0)
    expect(report.slotPrecisionAt3).toBe(0)
    expect(report.statusCounts).toEqual({
      hit: 0,
      miss: 1,
      unexpected_untradeable: 0,
      data_error: 1,
    })
    expect(report.dataErrorRate).toBe(0.5)
  })

  it('samples the policy pool deterministically without replacement for each date', () => {
    const pool = new Map([['2026-01-02', ['D', 'B', 'A', 'C']]])
    const strategy = createPolicyRandomStrategy(pool, 17)
    const handler = {} as Parameters<StockPickStrategy>[0]

    const first = strategy(handler, ['A', 'B', 'C', 'D'], '2026-01-02')
    const second = strategy(handler, ['A', 'B', 'C', 'D'], '2026-01-02')

    expect(first).toEqual(second)
    expect(first).toHaveLength(3)
    expect(new Set(first).size).toBe(3)
  })

  it('aligns paired daily hits, counts excluded dates, and bootstraps deterministically', () => {
    const base = {
      daily: [
        { simDate: '2026-01-02', hits: 2 },
        { simDate: '2026-01-05', hits: 1 },
      ],
    } as unknown as ReturnType<typeof runBacktest>
    const challenger = {
      daily: [
        { simDate: '2026-01-05', hits: 3 },
        { simDate: '2026-01-06', hits: 0 },
      ],
    } as unknown as ReturnType<typeof runBacktest>

    const paired = pairedDailyDelta(base, challenger)
    expect([...paired]).toEqual([{ simDate: '2026-01-05', aHits: 1, bHits: 3, delta: -2 }])
    expect(paired.excludedDates).toEqual({ onlyA: 1, onlyB: 1, total: 2 })
    expect(movingBlockBootstrapCi([0, 1, 0, 1], {
      blockLength: 2,
      resamples: 100,
      seed: 7,
    })).toEqual(movingBlockBootstrapCi([0, 1, 0, 1], {
      blockLength: 2,
      resamples: 100,
      seed: 7,
    }))
  })
})
