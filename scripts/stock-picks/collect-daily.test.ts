import { describe, expect, it, vi } from 'vitest'

import {
  collectDailyStockPrices,
  DAILY_COLLECTION_TRADING_DAYS,
  DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
} from '@/scripts/stock-picks/collect-daily'
import { KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND } from '@/scripts/tli/prices/kis-daily-price-collector'

describe('daily stock price collection', () => {
  it('collects the active full universe and KOSPI over one seven-day range per symbol', async () => {
    const collectPriceRange = vi.fn(async () => ({
      callBudget: DEFAULT_DAILY_COLLECTION_CALL_BUDGET,
      rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
      requestedRows: 3,
      attemptedCalls: 3,
      successCount: 2,
      failureCount: 1,
      failedSymbols: ['KOSDAQ:000002'],
      skippedForBudget: 0,
      persistedRows: 14,
      successRate: 2 / 3,
      dateCoverageRate: 1,
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
})
