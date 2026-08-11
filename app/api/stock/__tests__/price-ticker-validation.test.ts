import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getBatchStockPricesMock,
  getBatchDailyClosePricesMock,
  getCacheMock,
  saveCacheMock,
} = vi.hoisted(() => ({
  getBatchStockPricesMock: vi.fn(),
  getBatchDailyClosePricesMock: vi.fn(),
  getCacheMock: vi.fn(),
  saveCacheMock: vi.fn(),
}))

vi.mock('@/app/archive/_utils/api/kis/client', () => ({
  getBatchStockPrices: getBatchStockPricesMock,
  getBatchDailyClosePrices: getBatchDailyClosePricesMock,
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

function request(path: string): NextRequest {
  return new NextRequest(`https://stockmatrix.co.kr${path}`, {
    headers: { 'x-real-ip': '203.0.113.5' },
  })
}

beforeEach(() => {
  vi.resetModules()
  getCacheMock.mockReset().mockResolvedValue(new Map())
  saveCacheMock.mockReset().mockResolvedValue(undefined)
  getBatchStockPricesMock.mockReset().mockResolvedValue({
    prices: new Map(),
    failures: new Map<string, string>(),
  })
  getBatchDailyClosePricesMock.mockReset().mockResolvedValue(new Map())
})

describe('GET /api/stock/price ticker validation', () => {
  it.each(['KOSPI:005930', '005930'])('accepts %s', async (ticker) => {
    const { GET } = await import('@/app/api/stock/price/route')

    const response = await GET(request(`/api/stock/price?tickers=${ticker}`))

    expect(response.status).toBe(200)
    expect(getBatchStockPricesMock).toHaveBeenCalledWith([ticker])
  })

  it('accepts the archive exchange-prefixed ticker that daily-close accepts', async () => {
    const ticker = 'KOSPI:005930'
    const { GET: getPrice } = await import('@/app/api/stock/price/route')
    const { GET: getDailyClose } = await import('@/app/api/stock/daily-close/route')

    const priceResponse = await getPrice(request(`/api/stock/price?tickers=${ticker}`))
    const dailyCloseResponse = await getDailyClose(
      request(`/api/stock/daily-close?tickers=${ticker}&date=20250101`)
    )

    expect(priceResponse.status).toBe(200)
    expect(dailyCloseResponse.status).toBe(200)
    expect(getBatchDailyClosePricesMock).toHaveBeenCalledWith([ticker], '20250101')
  })

  it.each(['', ':005930', 'KOSPI:', 'KOSPI:005930:X', '005930;DROP TABLE', '삼성전자'])(
    'rejects malformed ticker %j',
    async (ticker) => {
      const { GET } = await import('@/app/api/stock/price/route')
      const response = await GET(request(`/api/stock/price?tickers=${encodeURIComponent(ticker)}`))
      const body = await response.json()

      expect(response.status).toBe(400)
      if (ticker) {
        expect(body.error).toContain('005930')
        expect(body.error).toContain('KOSPI:005930')
      }
      expect(getBatchStockPricesMock).not.toHaveBeenCalled()
    }
  )
})
