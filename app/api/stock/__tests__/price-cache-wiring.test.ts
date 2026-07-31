/**
 * Regression test for the server-side price cache.
 *
 * Migration 056b revokes anonymous writes to stock_price_cache, so the browser
 * can no longer populate it. This route became the only writer — if it stops
 * reading and writing the cache, the table stays permanently empty and every
 * request falls through to KIS.
 */

import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getBatchStockPricesMock, getCacheMock, saveCacheMock } = vi.hoisted(() => ({
  getBatchStockPricesMock: vi.fn(),
  getCacheMock: vi.fn(),
  saveCacheMock: vi.fn(),
}))

vi.mock('@/app/archive/_utils/api/kis/client', () => ({
  getBatchStockPrices: getBatchStockPricesMock,
}))
vi.mock('@/app/archive/_utils/cache/stock-price', () => ({
  getBatchPricesFromCache: getCacheMock,
  saveBatchPricesToCache: saveCacheMock,
}))
vi.mock('@/lib/security/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/rate-limit')>()
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed', remaining: 30, resetAt: 0 }),
    getTrustedClientIp: vi.fn().mockReturnValue('203.0.113.5'),
  }
})

const originalEnv = process.env

function priceRequest(tickers: string): NextRequest {
  return new NextRequest(`https://stockmatrix.co.kr/api/stock/price?tickers=${tickers}`, {
    headers: { 'x-real-ip': '203.0.113.5' },
  })
}

function livePrice(ticker: string) {
  return {
    ticker,
    currentPrice: 70000,
    previousClose: 69000,
    changeRate: 1.45,
    volume: 1_000_000,
    timestamp: 1_800_000_000,
  }
}

beforeEach(() => {
  vi.resetModules()
  getCacheMock.mockReset().mockResolvedValue(new Map())
  saveCacheMock.mockReset().mockResolvedValue(undefined)
  getBatchStockPricesMock.mockReset().mockResolvedValue({
    prices: new Map(),
    failures: new Map<string, string>(),
  })
  process.env = { ...originalEnv, RATE_LIMIT_HMAC_SECRET: 'h'.repeat(32) }
})

afterAll(() => {
  process.env = originalEnv
})

describe('GET /api/stock/price cache wiring', () => {
  it('only asks KIS for tickers the cache missed', async () => {
    getCacheMock.mockResolvedValue(
      new Map([['005930', { ...livePrice('005930'), expires_at: 1_900_000_000 }]])
    )
    getBatchStockPricesMock.mockResolvedValue({
      prices: new Map([['035720', livePrice('035720')]]),
      failures: new Map<string, string>(),
    })

    const { GET } = await import('@/app/api/stock/price/route')
    const response = await GET(priceRequest('005930,035720'))
    const body = await response.json()

    expect(getBatchStockPricesMock).toHaveBeenCalledWith(['035720'])
    expect(Object.keys(body.prices).sort()).toEqual(['005930', '035720'])
    expect(body.meta.success).toBe(2)
  })

  it('writes freshly fetched prices back to the cache', async () => {
    getBatchStockPricesMock.mockResolvedValue({
      prices: new Map([['005930', livePrice('005930')]]),
      failures: new Map<string, string>(),
    })

    const { GET } = await import('@/app/api/stock/price/route')
    await GET(priceRequest('005930'))

    expect(saveCacheMock).toHaveBeenCalledTimes(1)
    const [rows] = saveCacheMock.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ticker: '005930', currentPrice: 70000 })
    expect(typeof rows[0].expires_at).toBe('number')
  })

  it('skips the KIS call entirely when every ticker is cached', async () => {
    getCacheMock.mockResolvedValue(
      new Map([['005930', { ...livePrice('005930'), expires_at: 1_900_000_000 }]])
    )

    const { GET } = await import('@/app/api/stock/price/route')
    const response = await GET(priceRequest('005930'))
    const body = await response.json()

    expect(getBatchStockPricesMock).not.toHaveBeenCalled()
    expect(saveCacheMock).not.toHaveBeenCalled()
    // expires_at is an internal cache field and must not leak into the response
    expect(body.prices['005930']).not.toHaveProperty('expires_at')
  })
})
