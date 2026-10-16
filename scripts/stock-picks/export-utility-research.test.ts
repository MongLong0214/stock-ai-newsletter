import { describe, expect, it } from 'vitest'

import { buildPriceBook } from '@/scripts/stock-picks/data-handler'
import { utilityResearchLabel } from '@/scripts/stock-picks/export-utility-research'
import { TradingDayIndex } from '@/scripts/stock-picks/trading-days'
import type { StockDailyPriceRow } from '@/scripts/tli/prices/stock-daily-prices'

const SYMBOL = 'KOSPI:005930'
const DATES = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
const buildRows = (): StockDailyPriceRow[] => DATES.map((trade_date) => ({
  symbol: SYMBOL, trade_date, open: 100, high: 105, low: 95, close: 100, volume: 1000, source: 'kis',
}))
const outcome = (rows = buildRows(), dates = DATES) => utilityResearchLabel(
  SYMBOL, DATES[0]!, buildPriceBook(rows), new TradingDayIndex(dates),
)

describe('utilityResearchLabel', () => {
  it('retains a normal training label without a null reason', () => {
    expect(outcome()).toMatchObject({
      label: { status: 'miss' }, labelNullReason: null, lockedLimitUpEntry: false, suspensionPath: false,
    })
  })

  it.each([1, 2, 3, 4, 5])('excludes and counts a zero-volume D%i without treating it as immature', (day) => {
    const rows = buildRows()
    rows[day] = { ...rows[day]!, open: 100, high: 100, low: 100, close: 100, volume: 0 }
    expect(outcome(rows)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', suspensionPath: true, lockedLimitUpEntry: false,
    })
  })

  it('excludes and counts a locked-limit-up entry with traded volume', () => {
    const rows = buildRows()
    rows[1] = { ...rows[1]!, open: 130, high: 130, low: 130, close: 130 }
    expect(outcome(rows)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', lockedLimitUpEntry: true, suspensionPath: false,
    })
  })

  it('distinguishes an unfinished window from observed suspensions in an unfinished window', () => {
    const rows = buildRows().slice(0, 3)
    const dates = DATES.slice(0, 3)
    expect(outcome(rows, dates)).toMatchObject({ label: null, labelNullReason: 'immature', suspensionPath: false })
    rows[2] = { ...rows[2]!, volume: 0 }
    expect(outcome(rows, dates)).toMatchObject({
      label: null, labelNullReason: 'suspendedOrUntradeable', suspensionPath: true,
    })
  })

  it.each([null, -1])('keeps invalid volume %j excluded as a data error', (volume) => {
    const rows = buildRows()
    rows[3] = { ...rows[3]!, volume }
    expect(outcome(rows)).toMatchObject({ label: null, labelNullReason: 'dataError', suspensionPath: false })
  })

  it('distinguishes missing price rows from immature windows and suspensions', () => {
    expect(outcome(buildRows().filter((_, i) => i !== 3))).toMatchObject({
      label: null, labelNullReason: 'dataError', suspensionPath: false,
    })
  })
})
