import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import {
  backfillStockDailyPrices,
  buildBackfillDateRanges,
} from '@/scripts/stock-picks/backfill-daily-prices'

const fromKisDate = (date: string): string => (
  `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
)

describe('stock daily price backfill', () => {
  it('splits the requested period into newest-first ranges of at most 100 trading days', () => {
    const ranges = buildBackfillDateRanges({
      startDate: '2025-08-28',
      endDate: '2026-08-28',
    })

    expect(ranges.length).toBeGreaterThan(2)
    expect(ranges[0]?.endDate).toBe('2026-08-28')
    for (const range of ranges) {
      expect(getKoreanTradingDatesBetween(range).length).toBeLessThanOrEqual(100)
    }
  })

  it('resumes at the next range after the call budget interrupts a symbol', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stock-backfill-'))
    const statePath = join(directory, 'state.json')
    const calls: string[] = []
    const fetchDailyRangePrices = vi.fn(async (symbol: string, startDate: string, endDate: string) => {
      calls.push(`${symbol}:${startDate}:${endDate}`)
      return [{
        date: fromKisDate(endDate),
        open: null,
        high: null,
        low: null,
        close: 100,
        volume: null,
      }]
    })
    const persistDailyPrices = vi.fn(async (rows: readonly unknown[]) => rows.length)
    const loadSymbols = vi.fn(async () => ['KOSPI:005930'])

    try {
      const first = await backfillStockDailyPrices({
        callBudget: 1,
        endDate: '2026-08-28',
        years: 1,
        statePath,
        delayMs: 0,
        fetchDailyRangePrices,
        fetchIndexDailyRangePrices: fetchDailyRangePrices,
        persistDailyPrices,
        loadSymbols,
      })
      expect(first).toMatchObject({
        attemptedCalls: 1,
        successCount: 0,
        failureCount: 0,
        remainingCount: 2,
      })

      const second = await backfillStockDailyPrices({
        callBudget: 10,
        endDate: '2026-08-28',
        years: 1,
        statePath,
        delayMs: 0,
        fetchDailyRangePrices,
        fetchIndexDailyRangePrices: fetchDailyRangePrices,
        persistDailyPrices,
        loadSymbols,
      })
      expect(second).toMatchObject({
        successCount: 2,
        failureCount: 0,
        remainingCount: 0,
      })
      expect(new Set(calls).size).toBe(calls.length)
      expect(calls.some((call) => call.startsWith('0001:'))).toBe(true)
      expect(calls.some((call) => call.startsWith('KOSPI:005930:'))).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('backfills the KOSPI index under the bare KOSPI symbol', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stock-backfill-index-'))
    const statePath = join(directory, 'state.json')

    try {
      const persistedSymbols: string[] = []
      const fetchIndexDailyRangePrices = vi.fn(async (_indexCode, _startDate, endDate) => [{
        date: fromKisDate(endDate),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000,
      }])
      const report = await backfillStockDailyPrices({
        callBudget: 10,
        endDate: '2026-08-28',
        years: 1,
        statePath,
        delayMs: 0,
        loadSymbols: async () => [],
        fetchIndexDailyRangePrices,
        persistDailyPrices: async (rows) => {
          persistedSymbols.push(...rows.map((row) => row.symbol))
          return rows.length
        },
      })

      expect(report).toMatchObject({
        targetSymbols: 1,
        successCount: 1,
        failureCount: 0,
        remainingCount: 0,
      })
      expect(fetchIndexDailyRangePrices).toHaveBeenCalledWith('0001', expect.any(String), expect.any(String))
      expect(new Set(persistedSymbols)).toEqual(new Set(['KOSPI']))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports an incomplete upsert as an exact symbol failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'stock-backfill-failure-'))
    const statePath = join(directory, 'state.json')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const report = await backfillStockDailyPrices({
        callBudget: 1,
        endDate: '2026-08-28',
        years: 1,
        statePath,
        delayMs: 0,
        loadSymbols: async () => [],
        fetchIndexDailyRangePrices: async (_indexCode, _startDate, endDate) => [{
          date: fromKisDate(endDate),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        }],
        persistDailyPrices: async () => 0,
      })

      expect(report).toMatchObject({
        attemptedCalls: 1,
        successCount: 0,
        failureCount: 1,
        remainingCount: 1,
        failedSymbols: ['KOSPI'],
      })
    } finally {
      consoleErrorSpy.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
