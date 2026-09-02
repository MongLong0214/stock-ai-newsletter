import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  dedupeStockDailyPriceRows,
  KOSPI_INDEX_SYMBOL,
  selectTopThemeStockSymbols,
  type StockDailyPriceInput,
} from '@/scripts/tli/prices/stock-daily-prices'
import {
  collectAndPersistStockDailyPriceRange,
  DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
  KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
} from '@/scripts/tli/prices/kis-daily-price-collector'
import { createKisApiError } from '@/app/archive/_utils/api/kis/client'

describe('stock daily prices', () => {
  it('keeps the stock_daily_prices migration additive with the expected dedupe key', async () => {
    const migration = await readFile('supabase/migrations/031_create_stock_daily_prices.sql', 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.stock_daily_prices')
    expect(migration).toContain('PRIMARY KEY (symbol, trade_date)')
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i)
  })

  it('adds nullable OHLC columns and a service-role-only stock master additively', async () => {
    const migration = await readFile('supabase/migrations/057_stock_ohlc_and_master.sql', 'utf8')

    expect(migration).toContain('ADD COLUMN open NUMERIC')
    expect(migration).toContain('ADD COLUMN high NUMERIC')
    expect(migration).toContain('ADD COLUMN low NUMERIC')
    expect(migration).toContain('CHECK (high IS NULL OR low IS NULL OR high >= low)')
    expect(migration).toContain('CREATE TABLE public.stock_master')
    expect(migration).toContain('CREATE POLICY service_role_all_stock_master')
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i)
  })

  it('dedupes daily prices by symbol and trade date before upsert', () => {
    const rows = dedupeStockDailyPriceRows([
      { symbol: '005930', tradeDate: '2026-07-01', close: 70000, volume: 100 },
      { symbol: '005930', tradeDate: '2026-07-01', close: 70100, volume: 120 },
      { symbol: '000660', tradeDate: '2026-07-01', close: -1, volume: 20 },
    ])

    expect(rows).toEqual([
      {
        symbol: '005930',
        trade_date: '2026-07-01',
        open: null,
        high: null,
        low: null,
        close: 70100,
        volume: 120,
        source: 'kis',
      },
    ])
  })

  it('forms OHLC upsert rows while allowing nullable source values', () => {
    const rows = dedupeStockDailyPriceRows([
      {
        symbol: 'KOSPI:005930',
        tradeDate: '2026-08-27',
        open: 70000,
        high: null,
        low: null,
        close: 72800,
        volume: null,
      },
    ])

    expect(rows).toEqual([{
      symbol: 'KOSPI:005930',
      trade_date: '2026-08-27',
      open: 70000,
      high: null,
      low: null,
      close: 72800,
      volume: null,
      source: 'kis',
    }])
  })

  it('selects top active symbols per theme and deduplicates shared stocks', () => {
    const symbols = selectTopThemeStockSymbols([
      { theme_id: 'theme-a', symbol: '005930', relevance: 0.9, is_active: true },
      { theme_id: 'theme-a', symbol: '000660', relevance: 0.8, is_active: true },
      { theme_id: 'theme-a', symbol: '035420', relevance: 0.7, is_active: true },
      { theme_id: 'theme-b', symbol: '005930', relevance: 0.9, is_active: true },
      { theme_id: 'theme-b', symbol: '051910', relevance: 0.8, is_active: true },
      { theme_id: 'theme-b', symbol: '068270', relevance: 0.7, is_active: false },
    ], 2)

    expect(symbols).toEqual(['000660', '005930', '051910'])
  })

  it('defaults the KIS call budget to 1,000 per day', () => {
    expect(DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET).toBe(1000)
  })

  it('makes one period-range call per symbol (plus KOSPI) instead of one call per date×symbol pair', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([
      { date: '2026-07-01', open: 69000, high: 71000, low: 68500, close: 70000, volume: 1000 },
      { date: '2026-07-02', open: null, high: null, low: null, close: 70500, volume: 1200 },
    ])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([
      { date: '2026-07-01', close: 2650.5, volume: null },
      { date: '2026-07-02', close: 2655.1, volume: null },
    ])
    const persistDailyPrices = vi.fn(async (rows: readonly StockDailyPriceInput[]) => rows.length)
    const loadSymbols = vi.fn(async () => ['005930', '000660'])

    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-02',
      days: 2,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })

    // 심볼 2개 + KOSPI = 콜 3건 (날짜×심볼 6건이 아님)
    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledTimes(1)
    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledWith('0001', '20260701', '20260702')
    expect(fetchDailyRangeClosePrices).toHaveBeenCalledTimes(2)
    expect(fetchDailyRangeClosePrices).toHaveBeenCalledWith('005930', '20260701', '20260702')
    expect(fetchDailyRangeClosePrices).toHaveBeenCalledWith('000660', '20260701', '20260702')
    expect(report.requestedRows).toBe(3)
    expect(report.attemptedCalls).toBe(3)
    expect(report.successCount).toBe(3)
    expect(report.persistedRows).toBe(6)
    expect(report.dateCoverageRate).toBe(1)
    expect(persistDailyPrices).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      symbol: '005930',
      tradeDate: '2026-07-01',
      open: 69000,
      high: 71000,
      low: 68500,
      close: 70000,
    })]))
  })

  it('always includes KOSPI even when absent from the loaded symbols, and never drops it via the budget cap', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([
      { date: '2026-07-02', close: 2655.1, volume: null },
    ])
    const persistDailyPrices = vi.fn(async () => 0)
    const loadSymbols = vi.fn(async () => ['005930', '000660', '035420'])

    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-02',
      days: 1,
      callBudget: 2,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })

    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledTimes(1)
    expect(fetchDailyRangeClosePrices).toHaveBeenCalledTimes(1)
    expect(report.requestedRows).toBe(4)
    expect(report.attemptedCalls).toBe(2)
    expect(report.skippedForBudget).toBe(2)
  })

  it('stops at the collection deadline and counts all remaining symbols as skipped', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-02T00:00:00.000Z'))
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const fetchIndexDailyRangeClosePrices = vi.fn(async () => {
      vi.setSystemTime(new Date('2026-07-02T00:00:01.000Z'))
      return [{ date: '2026-07-02', close: 2655.1, volume: null }]
    })
    const persistDailyPrices = vi.fn(async (rows: readonly StockDailyPriceInput[]) => rows.length)
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const report = await collectAndPersistStockDailyPriceRange({
        endDate: '2026-07-02',
        days: 1,
        deadlineMs: 500,
        delayMs: 0,
        finalizedThroughDate: '2026-07-02',
        fetchDailyRangeClosePrices,
        fetchIndexDailyRangeClosePrices,
        persistDailyPrices,
        loadSymbols: async () => ['005930', '000660'],
      })

      expect(report.attemptedCalls).toBe(1)
      expect(report.successCount).toBe(1)
      expect(report.skippedForBudget).toBe(2)
      expect(fetchDailyRangeClosePrices).not.toHaveBeenCalled()
      expect(persistDailyPrices).toHaveBeenCalledOnce()
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('deadline 초과'))
    } finally {
      consoleWarnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('does not duplicate KOSPI when it is already present in the loaded symbols', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([
      { date: '2026-07-02', close: 2655.1, volume: null },
    ])
    const persistDailyPrices = vi.fn(async () => 0)
    const loadSymbols = vi.fn(async () => ['005930', KOSPI_INDEX_SYMBOL])

    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-02',
      days: 1,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })

    expect(report.requestedRows).toBe(2)
    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledTimes(1)
  })

  it('routes KOSPI to the index fetcher and reports a failure (without touching the stock fetcher) when no matching trading-day rows return', async () => {
    vi.useFakeTimers()
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const persistDailyPrices = vi.fn(async () => 0)
    const loadSymbols = vi.fn(async () => [])

    const reportPromise = collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-02',
      days: 1,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })
    await vi.runAllTimersAsync()
    const report = await reportPromise

    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledWith('0001', '20260702', '20260702')
    expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledTimes(3)
    expect(fetchDailyRangeClosePrices).not.toHaveBeenCalled()
    expect(report.failureCount).toBe(1)
    expect(report.successCount).toBe(0)
    expect(report.indexFailed).toBe(true)
    vi.useRealTimers()
  })

  it('reports symbol-level success/failure counts and success rate', async () => {
    const fetchDailyRangeClosePrices = vi.fn()
      .mockResolvedValueOnce([{ date: '2026-07-01', close: 70000, volume: 100 }])
      .mockResolvedValueOnce([])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([{ date: '2026-07-01', close: 2650, volume: null }])
    const persistDailyPrices = vi.fn(async (rows: readonly StockDailyPriceInput[]) => rows.length)
    const loadSymbols = vi.fn(async () => ['005930', '000660'])

    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-01',
      days: 1,
      callBudget: DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })

    expect(report).toMatchObject({
      callBudget: DEFAULT_KIS_DAILY_PRICE_CALL_BUDGET,
      rateLimitPerSecond: KIS_DAILY_PRICE_RATE_LIMIT_PER_SECOND,
      requestedRows: 3,
      attemptedCalls: 3,
      successCount: 2,
      failureCount: 1,
      successRate: 2 / 3,
    })
    expect(report.persistedRows).toBe(2)
  })

  it('logs the collection-phase report and rethrows when persistence fails, instead of swallowing it', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([{ date: '2026-07-01', close: 70000, volume: 100 }])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([{ date: '2026-07-01', close: 2650, volume: null }])
    const persistError = new Error('일봉 주가 전량 저장 실패 (2건)')
    const persistDailyPrices = vi.fn().mockRejectedValue(persistError)
    const loadSymbols = vi.fn(async () => ['005930'])
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      collectAndPersistStockDailyPriceRange({
        endDate: '2026-07-01',
        days: 1,
        delayMs: 0,
        fetchDailyRangeClosePrices,
        fetchIndexDailyRangeClosePrices,
        persistDailyPrices,
        loadSymbols,
      }),
    ).rejects.toThrow(persistError)

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('attempted=2, success=2, failure=0'),
      persistError.message,
    )

    consoleErrorSpy.mockRestore()
  })

  it('computes date coverage rate below 1 when a requested trading day has no data from any symbol', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([{ date: '2026-07-01', close: 70000, volume: 100 }])
    const fetchIndexDailyRangeClosePrices = vi.fn().mockResolvedValue([{ date: '2026-07-01', close: 2650, volume: null }])
    const persistDailyPrices = vi.fn(async (rows: readonly StockDailyPriceInput[]) => rows.length)
    const loadSymbols = vi.fn(async () => ['005930'])

    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-07-02',
      days: 2,
      delayMs: 0,
      fetchDailyRangeClosePrices,
      fetchIndexDailyRangeClosePrices,
      persistDailyPrices,
      loadSymbols,
    })

    // 2026-07-01만 데이터 확보, 2026-07-02는 어떤 심볼에서도 반환되지 않음
    expect(report.dateCoverageRate).toBe(0.5)
  })

  it('drops rows newer than the finalized trading date', async () => {
    const persisted: StockDailyPriceInput[][] = []
    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-09-02',
      days: 2,
      finalizedThroughDate: '2026-09-01',
      delayMs: 0,
      loadSymbols: async () => ['KOSPI:005930'],
      fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 3200, volume: null }],
      fetchDailyRangeClosePrices: async () => [
        { date: '2026-09-02', open: 70000, high: 71000, low: 69000, close: 70500, volume: 100 },
        { date: '2026-09-01', open: 69000, high: 70000, low: 68000, close: 69500, volume: 100 },
      ],
      persistDailyPrices: async (rows) => {
        persisted.push([...rows])
        return rows.length
      },
    })

    expect(report.droppedNotFinalizedRows).toBe(1)
    expect(persisted.flat().some((row) => row.tradeDate === '2026-09-02')).toBe(false)
  })

  it('drops phantom-shaped rows only on or after the KST run date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T21:10:00.000Z'))
    const persisted: StockDailyPriceInput[][] = []
    try {
      const report = await collectAndPersistStockDailyPriceRange({
        endDate: '2026-09-02',
        days: 2,
        finalizedThroughDate: '2026-09-02',
        delayMs: 0,
        loadSymbols: async () => ['KOSPI:005930'],
        fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-02', close: 3200, volume: null }],
        fetchDailyRangeClosePrices: async () => [
          { date: '2026-09-02', open: 70000, high: 70000, low: 70000, close: 70000, volume: 0 },
          { date: '2026-09-01', open: 69000, high: 69000, low: 69000, close: 69000, volume: 0 },
        ],
        persistDailyPrices: async (rows) => {
          persisted.push([...rows])
          return rows.length
        },
      })

      expect(report.droppedPhantomRows).toBe(1)
      expect(persisted.flat()).toEqual(expect.arrayContaining([
        expect.objectContaining({ symbol: 'KOSPI:005930', tradeDate: '2026-09-01', volume: 0 }),
      ]))
      expect(persisted.flat().some((row) => row.symbol === 'KOSPI:005930' && row.tradeDate === '2026-09-02')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries KOSPI three times and reports one final index failure', async () => {
    vi.useFakeTimers()
    const fetchIndexDailyRangeClosePrices = vi.fn().mockRejectedValue(
      createKisApiError('http', 'synthetic index failure'),
    )
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const reportPromise = collectAndPersistStockDailyPriceRange({
        endDate: '2026-09-01',
        days: 1,
        delayMs: 0,
        loadSymbols: async () => [],
        fetchIndexDailyRangeClosePrices,
        persistDailyPrices: async () => 0,
      })
      await vi.runAllTimersAsync()
      const report = await reportPromise

      expect(fetchIndexDailyRangeClosePrices).toHaveBeenCalledTimes(3)
      expect(report.indexFailed).toBe(true)
      expect(report.failedSymbols).toEqual([KOSPI_INDEX_SYMBOL])
      expect(report.failureKinds).toEqual({ http: 1 })
    } finally {
      consoleWarnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('retries a transient stock failure and records recovery', async () => {
    vi.useFakeTimers()
    const fetchDailyRangeClosePrices = vi.fn()
      .mockRejectedValueOnce(createKisApiError('http', 'temporary'))
      .mockResolvedValueOnce([{ date: '2026-09-01', close: 70000, volume: 100 }])
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const reportPromise = collectAndPersistStockDailyPriceRange({
        endDate: '2026-09-01',
        days: 1,
        delayMs: 0,
        loadSymbols: async () => ['KOSPI:005930'],
        fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 3200, volume: null }],
        fetchDailyRangeClosePrices,
        persistDailyPrices: async (rows) => rows.length,
      })
      await vi.runAllTimersAsync()
      const report = await reportPromise

      expect(fetchDailyRangeClosePrices).toHaveBeenCalledTimes(2)
      expect(report.retriedSymbols).toContain('KOSPI:005930')
      expect(report.recoveredSymbols).toContain('KOSPI:005930')
      expect(report.failedSymbols).not.toContain('KOSPI:005930')
    } finally {
      consoleWarnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('computes exact-date coverage across attempted stock symbols', async () => {
    const fetchDailyRangeClosePrices = vi.fn(async (symbol: string) => symbol === 'KOSPI:005930'
      ? [{ date: '2026-09-01', close: 70000, volume: 100 }]
      : [{ date: '2026-08-31', close: 120000, volume: 100 }])
    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-09-01',
      days: 2,
      finalizedThroughDate: '2026-09-01',
      delayMs: 0,
      loadSymbols: async () => ['KOSPI:005930', 'KOSPI:000660'],
      fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 3200, volume: null }],
      fetchDailyRangeClosePrices,
      persistDailyPrices: async (rows) => rows.length,
    })

    expect(report.exactDateSuccessCount).toBe(1)
    expect(report.exactDateCoverageRate).toBe(0.5)
  })

  it('paces from request start times rather than adding delay after response completion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    const starts: number[] = []
    const advanceResponse = async () => {
      starts.push(Date.now())
      vi.setSystemTime(Date.now() + 400)
      return [{ date: '2026-09-01', close: 100, volume: 100 }]
    }
    try {
      const reportPromise = collectAndPersistStockDailyPriceRange({
        endDate: '2026-09-01',
        days: 1,
        finalizedThroughDate: '2026-09-01',
        rateLimitPerSecond: 2,
        loadSymbols: async () => ['KOSPI:005930', 'KOSPI:000660'],
        fetchIndexDailyRangeClosePrices: advanceResponse,
        fetchDailyRangeClosePrices: advanceResponse,
        persistDailyPrices: async (rows) => rows.length,
      })
      await vi.runAllTimersAsync()
      await reportPromise

      expect(starts.map((startedAt) => startedAt - starts[0])).toEqual([0, 500, 1000])
    } finally {
      vi.useRealTimers()
    }
  })

  it('emits a heartbeat every 250 processed stock symbols', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const symbols = Array.from({ length: 250 }, (_, index) => `KOSPI:${String(index).padStart(6, '0')}`)
    try {
      await collectAndPersistStockDailyPriceRange({
        endDate: '2026-09-01',
        days: 1,
        finalizedThroughDate: '2026-09-01',
        delayMs: 0,
        loadSymbols: async () => symbols,
        fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 3200, volume: null }],
        fetchDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 100, volume: 100 }],
        persistDailyPrices: async (rows) => rows.length,
      })
      const heartbeats = consoleLogSpy.mock.calls
        .map(([line]) => typeof line === 'string' ? line : '')
        .filter((line) => line.includes('stock_daily_collection_progress'))
      expect(heartbeats).toHaveLength(1)
      expect(JSON.parse(heartbeats[0])).toMatchObject({ processed: 250, total: 250 })
    } finally {
      consoleLogSpy.mockRestore()
    }
  })

  it('does not retry an empty stock response', async () => {
    const fetchDailyRangeClosePrices = vi.fn().mockResolvedValue([])
    const report = await collectAndPersistStockDailyPriceRange({
      endDate: '2026-09-01',
      days: 1,
      finalizedThroughDate: '2026-09-01',
      delayMs: 0,
      loadSymbols: async () => ['KOSPI:005930'],
      fetchIndexDailyRangeClosePrices: async () => [{ date: '2026-09-01', close: 3200, volume: null }],
      fetchDailyRangeClosePrices,
      persistDailyPrices: async (rows) => rows.length,
    })

    expect(fetchDailyRangeClosePrices).toHaveBeenCalledOnce()
    expect(report.failureKinds).toEqual({ empty: 1 })
    expect(report.retriedSymbols).not.toContain('KOSPI:005930')
  })
})
