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

describe('KIS daily-range client contract', () => {
  beforeEach(() => {
    vi.resetModules()
    tokenStorage.getTokenFromStorage.mockResolvedValue({
      access_token: 'cached-token',
      expires_at: Date.now() + 60_000,
    })
    tokenStorage.saveTokenToStorage.mockResolvedValue(undefined)
    tokenStorage.invalidateTokenInStorage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps a successful empty output2 as a legitimate empty trading result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ rt_cd: '0', output2: [] })))
    const { getDailyRangeClosePrices } = await import('../client')

    await expect(getDailyRangeClosePrices('005930', '20260701', '20260702')).resolves.toEqual([])
  })

  it('throws a typed failure for HTTP and KIS API errors instead of returning []', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ rt_cd: '1' }, 503)))
    const { getDailyRangeClosePrices, KisDailyRangeRequestError } = await import('../client')

    await expect(getDailyRangeClosePrices('005930', '20260701', '20260702'))
      .rejects.toBeInstanceOf(KisDailyRangeRequestError)
  })

  it('throws when output2 is missing or not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ rt_cd: '0', output2: null })))
    const { getIndexDailyRangeClosePrices } = await import('../client')

    await expect(getIndexDailyRangeClosePrices('0001', '20260701', '20260702'))
      .rejects.toThrow(/output2 array/)
  })

  it('rejects malformed rows rather than filtering them into a false empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      rt_cd: '0',
      output2: [{ stck_bsop_date: '20260231', stck_clpr: '70000', acml_vol: '100' }],
    })))
    const { getDailyRangeClosePrices } = await import('../client')

    await expect(getDailyRangeClosePrices('005930', '20260201', '20260228'))
      .rejects.toThrow(/invalid date\/close/)
  })

  it('parses valid stock range rows without changing numeric meaning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      rt_cd: '0',
      output2: [{ stck_bsop_date: '20260701', stck_clpr: '70000', acml_vol: '1234' }],
    })))
    const { getDailyRangeClosePrices } = await import('../client')

    await expect(getDailyRangeClosePrices('005930', '20260701', '20260701')).resolves.toEqual([
      { date: '2026-07-01', close: 70_000, volume: 1_234 },
    ])
  })
})
