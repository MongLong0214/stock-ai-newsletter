import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import {
  measureForwardPicks,
  type PublishedNewsletterRow,
} from '@/scripts/stock-picks/measure-forward'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const DATES = [
  '2026-01-02',
  '2026-01-05',
  '2026-01-06',
  '2026-01-07',
  '2026-01-08',
  '2026-01-09',
] as const

const buildRows = (input: {
  readonly symbol: string
  readonly maxHigh: number
  readonly entryOpen?: number | null
  readonly missingHighDate?: string
}): StockDailyPriceRow[] => DATES.map((tradeDate, index) => ({
  symbol: input.symbol,
  trade_date: tradeDate,
  open: index === 1 ? (input.entryOpen === undefined ? 100 : input.entryOpen) : 100,
  high: tradeDate === input.missingHighDate ? null : index >= 1 ? input.maxHigh : 100,
  low: 90,
  close: 100,
  volume: 1000,
  source: 'kis',
}))

const newsletter = (
  date: string,
  source: string | null,
  tickers: readonly string[],
): PublishedNewsletterRow => ({
  newsletter_date: date,
  picks_source: source,
  gemini_analysis: JSON.stringify(tickers.map((ticker) => ({ ticker }))),
})

describe('measureForwardPicks', () => {
  it('measures only mature published picks and splits source and null results', () => {
    const hit = 'KOSPI:000001'
    const miss = 'KOSPI:000002'
    const missingEntry = 'KOSPI:000003'
    const immature = 'KOSPI:000004'
    const missingWindow = 'KOSPI:000005'
    const newsletters: PublishedNewsletterRow[] = [
      newsletter('2026-01-05', 'code', [hit]),
      newsletter('2026-01-05', 'llm_fallback', [miss]),
      newsletter('2026-01-05', null, [missingEntry]),
      newsletter('2026-01-09', 'code', [immature]),
      newsletter('2026-01-05', 'code', [missingWindow]),
      {
        newsletter_date: '2026-01-06',
        picks_source: 'crash',
        gemini_analysis: '{"type":"crash_alert"}',
      },
      {
        newsletter_date: '2026-01-07',
        picks_source: 'code',
        gemini_analysis: 'not json',
      },
    ]
    const prices = buildPriceBook([
      ...buildRows({ symbol: hit, maxHigh: 110 }),
      ...buildRows({ symbol: miss, maxHigh: 109 }),
      ...buildRows({ symbol: missingEntry, maxHigh: 110, entryOpen: null }),
      ...buildRows({ symbol: immature, maxHigh: 110 }),
      ...buildRows({ symbol: missingWindow, maxHigh: 110, missingHighDate: '2026-01-07' }),
    ])

    const report = measureForwardPicks({
      newsletters,
      prices,
      tradingDays: new TradingDayIndex(DATES),
      asOfDate: '2026-01-10',
      lookbackDays: 60,
    })

    expect(report.publishedNewsletterCount).toBe(7)
    expect(report.invalidNewsletterCount).toBe(1)
    expect(report.crashNewsletterCount).toBe(1)
    expect(report.loadedPickCount).toBe(5)
    expect(report.immaturePickCount).toBe(1)
    expect(report.overall).toEqual({
      totalPicks: 4,
      labeledPicks: 2,
      nullPicks: 2,
      touchedPicks: 1,
      hitRate: 0.5,
      nullRate: 0.5,
    })
    expect(report.byPicksSource.code.totalPicks).toBe(2)
    expect(report.byPicksSource.llm_fallback.hitRate).toBe(0)
    expect(report.byPicksSource.crash.totalPicks).toBe(0)
    expect(report.byPicksSource.null.nullPicks).toBe(1)
    expect(report.nullBreakdown).toEqual({
      missingEntryOpen: 1,
      missingWindowData: 1,
    })
    expect(report.recent4Weeks).toHaveLength(4)
  })
})
