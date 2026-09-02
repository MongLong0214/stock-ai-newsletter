import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { validateResearchDataset } from '@/scripts/stock-picks/data-contract'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const row = (
  symbol: string,
  tradeDate: string,
  overrides: Partial<StockDailyPriceRow> = {},
): StockDailyPriceRow => ({
  symbol,
  trade_date: tradeDate,
  open: 100,
  high: 105,
  low: 95,
  close: 102,
  volume: 1_000,
  source: 'kis',
  ...overrides,
})

describe('research dataset contract', () => {
  it('reports missing calendar trading days and per-symbol gaps', () => {
    const tradingDays = new TradingDayIndex(['2026-01-02', '2026-01-06'])
    const prices = buildPriceBook([
      row('KOSPI:000001', '2026-01-02'),
      row('KOSPI:000002', '2026-01-02'),
      row('KOSPI:000002', '2026-01-06'),
    ])

    expect(validateResearchDataset({
      tradingDays,
      prices,
      fromDate: '2026-01-02',
      toDate: '2026-01-07',
    })).toMatchObject({
      ok: false,
      missingTradingDays: ['2026-01-05', '2026-01-07'],
      symbolsWithGaps: 1,
    })
  })

  it('counts post-v2 phantom rows and OHLC invariant violations separately', () => {
    const dates = ['2026-08-03', '2026-08-04']
    const prices = buildPriceBook([
      row('KOSPI:000001', dates[0], {
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 0,
      }),
      row('KOSPI:000001', dates[1], { open: 110, high: 105 }),
    ])

    expect(validateResearchDataset({
      tradingDays: new TradingDayIndex(dates),
      prices,
      fromDate: dates[0],
      toDate: dates[1],
    })).toEqual({
      ok: false,
      missingTradingDays: [],
      phantomRows: 1,
      invalidOhlcRows: 1,
      symbolsWithGaps: 0,
    })
  })

  it('accepts a complete synthetic PriceBook', () => {
    const dates = ['2026-08-03', '2026-08-04']
    const prices = buildPriceBook(dates.map((date) => row('KOSPI:000001', date)))

    expect(validateResearchDataset({
      tradingDays: new TradingDayIndex(dates),
      prices,
      fromDate: dates[0],
      toDate: dates[1],
    }).ok).toBe(true)
  })
})
