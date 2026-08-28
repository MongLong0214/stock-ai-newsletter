import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { evaluateArchivePicks } from '@/scripts/stock-picks/evaluate-archives'
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
  readonly entryOpen?: number | null
  readonly missingHighDate?: string
}): StockDailyPriceRow[] => DATES.map((tradeDate, index) => ({
  symbol: input.symbol,
  trade_date: tradeDate,
  open: index === 1 ? (input.entryOpen === undefined ? 100 : input.entryOpen) : 200,
  high: tradeDate === input.missingHighDate ? null : 105,
  low: 95,
  close: 101,
  volume: 1000,
  source: 'kis',
}))

describe('evaluateArchivePicks', () => {
  it('uses the publication-day open when publication is on a trading day', () => {
    const symbol = 'KOSPI:005930'
    const report = evaluateArchivePicks({
      archivePicks: [{
        signalDate: '2026-01-05',
        ticker: symbol,
        archiveName: '삼성전자',
      }],
      stockMasterRows: [{ symbol, name: '삼성전자', is_active: true }],
      prices: buildPriceBook(buildRows({ symbol })),
      tradingDays: new TradingDayIndex(DATES),
    })

    expect(report.picks[0]?.label).toMatchObject({
      entryDate: '2026-01-05',
      entry: 100,
    })
    expect(report.nullPickCount).toBe(0)
  })

  it('separates every null result into one actionable reason', () => {
    const missingEntrySymbol = 'KOSPI:000001'
    const missingWindowSymbol = 'KOSPI:000002'
    const immatureSymbol = 'KOSPI:000003'
    const unresolvedSymbol = 'KOSPI:000004'
    const rows = [
      ...buildRows({ symbol: missingEntrySymbol, entryOpen: null }),
      ...buildRows({ symbol: missingWindowSymbol, missingHighDate: '2026-01-07' }),
      ...buildRows({ symbol: immatureSymbol }),
      ...buildRows({ symbol: unresolvedSymbol }),
    ]

    const report = evaluateArchivePicks({
      archivePicks: [
        { signalDate: '2026-01-05', ticker: 'KOSPI:999999', archiveName: '미매핑' },
        { signalDate: '2026-01-10', ticker: unresolvedSymbol, archiveName: '범위밖' },
        { signalDate: '2026-01-08', ticker: immatureSymbol, archiveName: '미성숙' },
        { signalDate: '2026-01-05', ticker: missingEntrySymbol, archiveName: '시가누락' },
        { signalDate: '2026-01-05', ticker: missingWindowSymbol, archiveName: '윈도누락' },
      ],
      stockMasterRows: [
        { symbol: unresolvedSymbol, name: '범위밖', is_active: true },
        { symbol: immatureSymbol, name: '미성숙', is_active: true },
        { symbol: missingEntrySymbol, name: '시가누락', is_active: true },
        { symbol: missingWindowSymbol, name: '윈도누락', is_active: true },
      ],
      prices: buildPriceBook(rows),
      tradingDays: new TradingDayIndex(DATES),
    })

    expect(report.nullBreakdown).toEqual({
      unmapped: 1,
      nonTradingUnresolved: 1,
      immature: 1,
      missingEntryOpen: 1,
      missingWindowData: 1,
    })
    expect(report.nullPickCount).toBe(5)
  })
})
