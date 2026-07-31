import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tokenStorage = vi.hoisted(() => ({
  getTokenFromStorage: vi.fn(),
  saveTokenToStorage: vi.fn(),
  invalidateTokenInStorage: vi.fn(),
}))

vi.mock('../token-storage', () => tokenStorage)
vi.mock('@/lib/_utils/env-validator', () => ({
  validateKisEnv: () => ({
    KIS_BASE_URL: 'https://kis.example.test',
    KIS_APP_KEY: 'app-key',
    KIS_APP_SECRET: 'app-secret',
  }),
}))

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const VALID_STOCK_RESPONSE = {
  rt_cd: '0',
  output: {
    stck_prpr: '70000',
    stck_sdpr: '69000',
    prdy_ctrt: '1.45',
    acml_vol: '100000',
  },
}

const TOKEN_ISSUANCE_RESPONSE = {
  access_token: 'fresh-token-xyz',
  token_type: 'Bearer',
  expires_in: 86400,
}

describe('KIS client auth refresh (AI-006)', () => {
  beforeEach(() => {
    vi.resetModules()
    tokenStorage.getTokenFromStorage.mockResolvedValue({
      access_token: 'stale-token',
      expires_at: Date.now() + 60_000,
    })
    tokenStorage.saveTokenToStorage.mockResolvedValue(undefined)
    tokenStorage.invalidateTokenInStorage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('retries exactly once on 401 with a fresh token for getStockPrice', async () => {
    const fetchMock = vi.fn()
      // First call: 401 from the API
      .mockResolvedValueOnce(jsonResponse({ msg1: 'token expired' }, 401))
      // Token issuance call
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      // Retry call: success
      .mockResolvedValueOnce(jsonResponse(VALID_STOCK_RESPONSE))

    vi.stubGlobal('fetch', fetchMock)
    const { getStockPrice } = await import('../client')

    const result = await getStockPrice('005930')
    expect(result.currentPrice).toBe(70000)

    // Verify: original request, token refresh, retry — exactly 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // Token was invalidated from storage
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenCalledTimes(1)
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenCalledWith('stale-token')
    expect(tokenStorage.saveTokenToStorage).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'fresh-token-xyz' }),
    )
  })

  it('retries exactly once on 403 for getDailyRangeClosePrices', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ msg1: 'forbidden' }, 403))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({
        rt_cd: '0',
        output2: [{ stck_bsop_date: '20260701', stck_clpr: '70000', acml_vol: '1234' }],
      }))

    vi.stubGlobal('fetch', fetchMock)
    const { getDailyRangeClosePrices } = await import('../client')

    const result = await getDailyRangeClosePrices('005930', '20260701', '20260701')
    expect(result).toEqual([{ date: '2026-07-01', close: 70_000, volume: 1_234 }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenCalledTimes(1)
  })

  it('retries exactly once on 401 for getIndexDailyRangeClosePrices', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({
        rt_cd: '0',
        output2: [{ stck_bsop_date: '20260701', bstp_nmix_prpr: '2750.50', acml_vol: '5000' }],
      }))

    vi.stubGlobal('fetch', fetchMock)
    const { getIndexDailyRangeClosePrices } = await import('../client')

    const result = await getIndexDailyRangeClosePrices('0001', '20260701', '20260701')
    expect(result).toEqual([{ date: '2026-07-01', close: 2750.50, volume: 5_000 }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not loop: second 401 after refresh propagates the error', async () => {
    const fetchMock = vi.fn()
      // First call: 401
      .mockResolvedValueOnce(jsonResponse({}, 401))
      // Token issuance
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      // Retry also returns 401 — must NOT loop
      .mockResolvedValueOnce(jsonResponse({}, 401))

    vi.stubGlobal('fetch', fetchMock)
    const { getStockPrice } = await import('../client')

    await expect(getStockPrice('005930')).rejects.toThrow(/401/)
    // Exactly 3 calls: original, token issuance, retry — no further attempts
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('invalidates only the rejected token, not a concurrently refreshed one', async () => {
    // Simulate: cache already has a different (newer) token when invalidation runs
    tokenStorage.getTokenFromStorage.mockResolvedValue({
      access_token: 'already-refreshed-by-other-caller',
      expires_at: Date.now() + 60_000,
    })

    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First API call with the cached stale-token gets 401
        return Promise.resolve(jsonResponse({}, 401))
      }
      if (callCount === 2) {
        // Token issuance
        return Promise.resolve(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      }
      // Retry succeeds
      return Promise.resolve(jsonResponse(VALID_STOCK_RESPONSE))
    })

    vi.stubGlobal('fetch', fetchMock)
    const { getStockPrice } = await import('../client')

    const result = await getStockPrice('005930')
    expect(result.currentPrice).toBe(70000)
  })

  it('shares concurrent token issuance (single-flight)', async () => {
    // No cached token — force issuance
    tokenStorage.getTokenFromStorage.mockResolvedValue(null)

    let tokenIssuanceCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/oauth2/tokenP')) {
        tokenIssuanceCalls++
        return Promise.resolve(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      }
      return Promise.resolve(jsonResponse(VALID_STOCK_RESPONSE))
    })

    vi.stubGlobal('fetch', fetchMock)
    const { getStockPrice } = await import('../client')

    // Launch two concurrent requests
    const [r1, r2] = await Promise.all([
      getStockPrice('005930'),
      getStockPrice('000660'),
    ])

    expect(r1.currentPrice).toBe(70000)
    expect(r2.currentPrice).toBe(70000)
    // Only ONE token issuance, not two
    expect(tokenIssuanceCalls).toBe(1)
  })

  it('shares one refresh across concurrent 401 responses without deleting the new token', async () => {
    let resolveIssuance: ((response: Response) => void) | undefined
    const issuanceResponse = new Promise<Response>((resolve) => { resolveIssuance = resolve })
    let issuanceCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/oauth2/tokenP')) {
        issuanceCalls += 1
        return issuanceResponse
      }
      const authorization = (options?.headers as Record<string, string> | undefined)?.authorization
      return Promise.resolve(authorization === 'Bearer stale-token'
        ? jsonResponse({}, 401)
        : jsonResponse(VALID_STOCK_RESPONSE))
    })

    vi.stubGlobal('fetch', fetchMock)
    const { getStockPrice } = await import('../client')
    const requests = Promise.all([getStockPrice('005930'), getStockPrice('000660')])
    await vi.waitFor(() => expect(issuanceCalls).toBe(1))
    resolveIssuance?.(jsonResponse(TOKEN_ISSUANCE_RESPONSE))

    const results = await requests
    expect(results.map((result) => result.currentPrice)).toEqual([70_000, 70_000])
    expect(issuanceCalls).toBe(1)
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenCalledTimes(2)
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenNthCalledWith(1, 'stale-token')
    expect(tokenStorage.invalidateTokenInStorage).toHaveBeenNthCalledWith(2, 'stale-token')
    expect(tokenStorage.saveTokenToStorage).toHaveBeenCalledTimes(1)
  })

  it('treats a second auth rejection as terminal for outer batch retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({}, 403))

    vi.stubGlobal('fetch', fetchMock)
    const { getBatchStockPrices } = await import('../client')
    const result = await getBatchStockPrices(['005930'])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.prices.size).toBe(0)
    expect(result.failures.get('005930')).toMatch(/after one token refresh/)
  })

  it('retries on 401 for getAuthoritativeStockMarket (market path)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({
        rt_cd: '0',
        output: { rprs_mrkt_kor_name: '코스피' },
      }))

    vi.stubGlobal('fetch', fetchMock)
    const { getAuthoritativeStockMarket } = await import('../client')

    const market = await getAuthoritativeStockMarket('005930')
    expect(market).toBe('KOSPI')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries on 403 for getDailyClosePrice (daily close path)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 403))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({
        rt_cd: '0',
        output2: [{ stck_clpr: '68000' }],
      }))

    vi.stubGlobal('fetch', fetchMock)
    const { getDailyClosePrice } = await import('../client')

    const price = await getDailyClosePrice('005930', '20260730')
    expect(price).toBe(68000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries on 401 for getIndexDailyClosePrice (index close path)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse(TOKEN_ISSUANCE_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({
        rt_cd: '0',
        output2: [{ bstp_nmix_prpr: '2750.50' }],
      }))

    vi.stubGlobal('fetch', fetchMock)
    const { getIndexDailyClosePrice } = await import('../client')

    const price = await getIndexDailyClosePrice('0001', '20260730')
    expect(price).toBe(2750.50)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
