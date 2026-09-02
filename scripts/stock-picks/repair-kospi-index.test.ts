import { describe, expect, it, vi } from 'vitest'

import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import { repairKospiIndex } from '@/scripts/stock-picks/repair-kospi-index'
import type { KisDailyRangePricePoint } from '@/app/archive/_utils/api/kis/client'
import type { StockDailyPriceInput } from '@/scripts/tli/prices/stock-daily-prices'

const point = (date: string): KisDailyRangePricePoint => ({
  date,
  open: 100,
  high: 105,
  low: 95,
  close: 102,
  volume: 1_000,
})

describe('KOSPI index gap repair', () => {
  it('splits contiguous gaps at 100 sessions and never writes in dry-run mode', async () => {
    const calendar = getKoreanTradingDatesBetween({
      startDate: '2025-01-02',
      endDate: '2026-01-30',
    }).slice(0, 205)
    const fetchRange = vi.fn(async (_code: string, from: string, to: string) => {
      const fromIso = `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}`
      const toIso = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}`
      return calendar.filter((date) => date >= fromIso && date <= toIso).map(point)
    })
    const persist = vi.fn()
    const sleep = vi.fn(async () => undefined)

    const result = await repairKospiIndex({
      from: calendar[0],
      to: calendar.at(-1),
    }, {
      loadExistingDates: async () => [],
      fetchRange,
      persist,
      ensureToken: async () => undefined,
      sleep,
      logger: { log: vi.fn() },
    })

    expect(result.spans.map((span) => span.count)).toEqual([100, 100, 5])
    expect(result.callCount).toBe(3)
    expect(fetchRange).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(persist).not.toHaveBeenCalled()
    expect(result.remainingMissing).toHaveLength(205)
  })

  it('applies only missing dates and verifies the repaired index', async () => {
    const expected = getKoreanTradingDatesBetween({
      startDate: '2026-01-02',
      endDate: '2026-01-07',
    })
    const stored = new Set([expected[0] as string, expected.at(-1) as string])
    const persist = vi.fn(async (rows: readonly StockDailyPriceInput[]) => {
      for (const row of rows) stored.add(row.tradeDate)
      return rows.length
    })
    const fetchRange = vi.fn(async () => [
      ...expected.map(point),
      point('2026-01-10'),
    ])

    const result = await repairKospiIndex({
      from: expected[0],
      to: expected.at(-1),
      apply: true,
    }, {
      loadExistingDates: async () => [...stored],
      fetchRange,
      persist,
      ensureToken: async () => undefined,
      sleep: async () => undefined,
      logger: { log: vi.fn() },
    })

    const written = persist.mock.calls[0]?.[0] ?? []
    expect(written.map((row) => row.tradeDate)).toEqual(expected.slice(1, -1))
    expect(written.every((row) => row.symbol === 'KOSPI' && row.source === 'kis')).toBe(true)
    expect(result.persistedRows).toBe(expected.length - 2)
    expect(result.remainingMissing).toEqual([])
  })

  it('persists legacy-shaped index points with null OHLC when close is valid', async () => {
    const date = '2026-01-02'
    const stored = new Set<string>()
    const persist = vi.fn(async (rows: readonly StockDailyPriceInput[]) => {
      for (const row of rows) stored.add(row.tradeDate)
      return rows.length
    })

    const result = await repairKospiIndex({ from: date, to: date, apply: true }, {
      loadExistingDates: async () => [...stored],
      fetchRange: async () => [{
        date,
        open: null,
        high: null,
        low: null,
        close: 2643.13,
        volume: 498_765_432,
      }],
      persist,
      ensureToken: async () => undefined,
      sleep: async () => undefined,
      logger: { log: vi.fn() },
    })

    expect(persist).toHaveBeenCalledWith([expect.objectContaining({
      symbol: 'KOSPI',
      tradeDate: date,
      open: null,
      high: null,
      low: null,
      close: 2643.13,
    })])
    expect(result.persistedRows).toBe(1)
    expect(result.remainingMissing).toEqual([])
  })

  it('still rejects a non-positive close when index OHLC is null', async () => {
    const date = '2026-01-02'

    await expect(repairKospiIndex({ from: date, to: date }, {
      loadExistingDates: async () => [],
      fetchRange: async () => [{
        date,
        open: null,
        high: null,
        low: null,
        close: 0,
        volume: null,
      }],
      ensureToken: async () => undefined,
      sleep: async () => undefined,
      logger: { log: vi.fn() },
    })).rejects.toThrow(`KOSPI repair OHLC invariant 실패: ${date}`)
  })
})
