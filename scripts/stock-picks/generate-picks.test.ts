import { describe, expect, it, vi } from 'vitest'

import { validateStockData } from '@/lib/llm/korea/stock-json'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { generatePicks, type StockPickMaster } from '@/scripts/stock-picks/generate-picks'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SIGNAL_DATE = '2026-08-27'
const TODAY_KST = '2026-08-28'
const SYMBOLS = ['KOSPI:000001', 'KOSPI:000002', 'KOSDAQ:000003'] as const

const makeFixture = () => {
  const dates = Array.from(
    { length: 120 },
    (_value, index) => addKoreanTradingDays(SIGNAL_DATE, index - 119),
  )
  const rows: StockDailyPriceRow[] = SYMBOLS.flatMap((symbol, symbolIndex) => dates.map((tradeDate, index) => {
    const close = 2_000 + symbolIndex * 100 + index * 2 + (index % 2 === 1 ? 10 : -10)
    return {
      symbol,
      trade_date: tradeDate,
      open: close - 5,
      high: close + 15,
      low: close - 15,
      close,
      volume: index === dates.length - 1 ? 5_000_000 + symbolIndex * 100_000 : 1_000_000 + index * 1_000,
      source: 'kis',
    }
  }))
  const masters: StockPickMaster[] = SYMBOLS.map((symbol, index) => ({
    symbol,
    name: `테스트종목${index + 1}`,
    is_active: true,
    status_flags: {},
  }))
  return { dates, prices: buildPriceBook(rows), masters }
}

describe('production stock pick generator', () => {
  it('creates exactly three StockData picks from a synthetic PriceBook fixture', async () => {
    const fixture = makeFixture()
    const loadPrices = vi.fn(async () => fixture.prices)
    const json = await generatePicks({
      todayKst: TODAY_KST,
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices,
        loadMasters: async () => fixture.masters,
      },
    })
    const picks: unknown = JSON.parse(json)

    expect(validateStockData(picks)).toBe(true)
    expect(picks).toHaveLength(3)
    expect(loadPrices).toHaveBeenCalledWith({
      startDate: fixture.dates[0],
      endDate: SIGNAL_DATE,
    })
    for (const pick of picks as Array<{ rationale: string; signals: Record<string, number> }>) {
      expect(pick.rationale.split('|').length).toBeGreaterThanOrEqual(12)
      expect(pick.rationale.length).toBeGreaterThanOrEqual(50)
      expect(Object.values(pick.signals).every(Number.isInteger)).toBe(true)
    }
  })

  it('throws when the last measured trading date is stale for today in KST', async () => {
    const fixture = makeFixture()
    await expect(generatePicks({
      todayKst: '2026-08-31',
      dependencies: {
        loadTradingDays: async () => new TradingDayIndex(fixture.dates),
        loadPrices: async () => fixture.prices,
        loadMasters: async () => fixture.masters,
      },
    })).rejects.toThrow(/신선도 게이트 실패/)
  })
})
