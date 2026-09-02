import { describe, expect, it, vi } from 'vitest'

import {
  collectDailyStockPrices,
  DAILY_COLLECTION_TRADING_DAYS,
  DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
  DEFAULT_DAILY_COLLECTION_DEADLINE_MS,
  DAILY_COLLECTION_POST_RESERVE_MS,
  getStockPicksKisRateLimitPerSecond,
} from '@/scripts/stock-picks/collect-daily'
import { KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND } from '@/scripts/tli/prices/kis-daily-price-collector'

describe('daily stock price collection', () => {
  it('collects the active full universe and KOSPI over one seven-day range per symbol', async () => {
    const collectPriceRange = vi.fn(async () => ({
      callBudget: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
      requestedRows: 3,
      attemptedCalls: 3,
      physicalCalls: 5,
      successCount: 2,
      failureCount: 1,
      failedSymbols: ['KOSDAQ:000002'],
      skippedForBudget: 0,
      persistedRows: 14,
      successRate: 2 / 3,
      dateCoverageRate: 1,
      droppedNotFinalizedRows: 0,
      droppedPhantomRows: 0,
      indexFailed: false,
      retriedSymbols: [],
      recoveredSymbols: [],
      failureKinds: { empty: 1 },
      exactDateSuccessCount: 2,
      exactDateCoverageRate: 2 / 3,
    }))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const report = await collectDailyStockPrices({
        endDate: '2026-08-28',
        collectPriceRange,
      })

      expect(collectPriceRange).toHaveBeenCalledWith({
        endDate: '2026-08-28',
        days: DAILY_COLLECTION_TRADING_DAYS,
        universe: 'full',
        callBudget: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
        rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
        deadlineMs: DEFAULT_DAILY_COLLECTION_DEADLINE_MS,
        finalizedThroughDate: '2026-08-28',
      })
      expect(report).toMatchObject({
        endDate: '2026-08-28',
        tradingDays: 7,
        failedSymbols: ['KOSDAQ:000002'],
      })
    } finally {
      consoleErrorSpy.mockRestore()
      consoleLogSpy.mockRestore()
    }
  })

  it('uses the stock-picks-specific rate when it is a valid integer', () => {
    expect(getStockPicksKisRateLimitPerSecond({
      STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND: '7',
    })).toBe(7)
  })

  it.each(['0', '11', '1.5', 'fast'])('rejects an invalid stock-picks-specific rate: %s', (value) => {
    expect(() => getStockPicksKisRateLimitPerSecond({
      STOCK_PICKS_KIS_RATE_LIMIT_PER_SECOND: value,
    })).toThrow('1..10')
  })

  it('uses the shared default when no stock-picks-specific rate is configured', () => {
    expect(getStockPicksKisRateLimitPerSecond({})).toBe(KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND)
  })

  it('caps collection at the remaining absolute budget minus the eight-minute reserve', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-09-02T00:00:00.000Z')
    vi.setSystemTime(startedAt)
    const collectPriceRange = vi.fn(async () => ({
      callBudget: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
      requestedRows: 1,
      attemptedCalls: 1,
      physicalCalls: 1,
      successCount: 1,
      failureCount: 0,
      failedSymbols: [],
      skippedForBudget: 0,
      persistedRows: 1,
      successRate: 1,
      dateCoverageRate: 1,
      droppedNotFinalizedRows: 0,
      droppedPhantomRows: 0,
      indexFailed: false,
      retriedSymbols: [],
      recoveredSymbols: [],
      failureKinds: {},
      exactDateSuccessCount: 0,
      exactDateCoverageRate: 0,
    }))

    try {
      await collectDailyStockPrices({
        endDate: '2026-09-02',
        deadlineAt: startedAt.getTime() + 20 * 60_000,
        collectPriceRange,
      })

      expect(collectPriceRange).toHaveBeenCalledWith(expect.objectContaining({
        deadlineMs: 20 * 60_000 - DAILY_COLLECTION_POST_RESERVE_MS,
      }))
    } finally {
      vi.useRealTimers()
    }
  })
})
