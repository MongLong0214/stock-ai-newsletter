import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getNewsletterStatus: vi.fn(),
  isKoreanTradingDate: vi.fn(),
  verifyNewsletterSent: vi.fn(),
}))

vi.mock('@/lib/newsletter/status', () => ({
  getNewsletterStatus: mocks.getNewsletterStatus,
}))

vi.mock('@/lib/tli/trading-calendar', () => ({
  isKoreanTradingDate: mocks.isKoreanTradingDate,
}))

vi.mock('@/lib/newsletter/verify-sent', () => ({
  verifyNewsletterSent: mocks.verifyNewsletterSent,
}))

import { GET as prepareNewsletter } from './newsletter-prepare/route'
import { GET as sendNewsletter } from './newsletter-send/route'
import { GET as runWatchdog } from './newsletter-watchdog/route'

const CRON_SECRET = 'test-cron-secret'
const DISPATCH_TOKEN = 'test-dispatch-token'
const originalCronSecret = process.env.CRON_SECRET
const originalDispatchToken = process.env.GH_DISPATCH_TOKEN

function cronRequest(token: string | null = CRON_SECRET): Request {
  const headers = token === null ? undefined : { Authorization: `Bearer ${token}` }
  return new Request('http://localhost/api/cron/newsletter', { headers })
}

function mockGitHubResponse(status = 204, body = '') {
  const fetchMock = vi.fn(async () => new Response(body || null, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('newsletter Vercel cron routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    process.env.GH_DISPATCH_TOKEN = DISPATCH_TOKEN
    mocks.isKoreanTradingDate.mockReturnValue(true)
    mocks.getNewsletterStatus.mockResolvedValue(null)
    mocks.verifyNewsletterSent.mockResolvedValue(0)
    mockGitHubResponse()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCronSecret

    if (originalDispatchToken === undefined) delete process.env.GH_DISPATCH_TOKEN
    else process.env.GH_DISPATCH_TOKEN = originalDispatchToken
  })

  describe('authentication', () => {
    it('fails closed with 401 when CRON_SECRET is unset', async () => {
      delete process.env.CRON_SECRET

      const response = await prepareNewsletter(cronRequest())

      expect(response.status).toBe(401)
      expect(mocks.isKoreanTradingDate).not.toHaveBeenCalled()
      expect(mocks.getNewsletterStatus).not.toHaveBeenCalled()
    })

    it('returns 401 for an invalid Bearer token', async () => {
      const response = await prepareNewsletter(cronRequest('wrong-secret'))

      expect(response.status).toBe(401)
      expect(mocks.isKoreanTradingDate).not.toHaveBeenCalled()
      expect(mocks.getNewsletterStatus).not.toHaveBeenCalled()
    })

    it('allows a valid Bearer token to reach the trading-day check', async () => {
      mocks.isKoreanTradingDate.mockReturnValue(false)

      const response = await prepareNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(mocks.isKoreanTradingDate).toHaveBeenCalledOnce()
    })
  })

  describe('non-trading day', () => {
    it.each([
      ['prepare', prepareNewsletter],
      ['send', sendNewsletter],
      ['watchdog', runWatchdog],
    ])('skips the %s route without downstream work', async (_name, handler) => {
      mocks.isKoreanTradingDate.mockReturnValue(false)

      const response = await handler(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: true,
        reason: 'non_trading_day',
      }))
      expect(mocks.getNewsletterStatus).not.toHaveBeenCalled()
      expect(mocks.verifyNewsletterSent).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('newsletter prepare', () => {
    it("skips when today's code picks already exist", async () => {
      mocks.getNewsletterStatus.mockResolvedValue({
        is_sent: false,
        picks_source: 'code',
      })

      const response = await prepareNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: true,
        reason: 'code_picks_exist',
      }))
      expect(fetch).not.toHaveBeenCalled()
    })

    it('dispatches prepare-newsletter.yml for a fallback row', async () => {
      mocks.getNewsletterStatus.mockResolvedValue({
        is_sent: false,
        picks_source: 'llm_fallback',
      })
      const fetchMock = mockGitHubResponse(204)

      const response = await prepareNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        dispatched: true,
        workflow: 'prepare-newsletter.yml',
      }))
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/repos/MongLong0214/stock-ai-newsletter/actions/workflows/prepare-newsletter.yml/dispatches',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${DISPATCH_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'stock-ai-newsletter-vercel-cron',
          }),
          body: JSON.stringify({ ref: 'main' }),
        }),
      )
    })

    it('skips when the newsletter has already been sent', async () => {
      mocks.getNewsletterStatus.mockResolvedValue({
        is_sent: true,
        picks_source: 'llm_fallback',
      })

      const response = await prepareNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: true,
        reason: 'already_sent',
      }))
      expect(fetch).not.toHaveBeenCalled()
    })

    it.each([401, 422])(
      'returns 500 and logs the GitHub response body when dispatch returns %s',
      async (status) => {
        mocks.getNewsletterStatus.mockResolvedValue({
          is_sent: false,
          picks_source: 'llm_fallback',
        })
        const responseBody = `github-error-${status}`
        mockGitHubResponse(status, responseBody)

        const response = await prepareNewsletter(cronRequest())

        expect(response.status).toBe(500)
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(responseBody))
      },
    )
  })

  describe('newsletter send', () => {
    it('skips when no prepared row exists', async () => {
      mocks.getNewsletterStatus.mockResolvedValue(null)

      const response = await sendNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: true,
        reason: 'not_prepared',
      }))
      expect(fetch).not.toHaveBeenCalled()
    })

    it('skips when the row is already sent', async () => {
      mocks.getNewsletterStatus.mockResolvedValue({
        is_sent: true,
        picks_source: 'code',
      })

      const response = await sendNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        skipped: true,
        reason: 'already_sent',
      }))
      expect(fetch).not.toHaveBeenCalled()
    })

    it('dispatches daily-newsletter.yml for an unsent row', async () => {
      mocks.getNewsletterStatus.mockResolvedValue({
        is_sent: false,
        picks_source: 'code',
      })
      const fetchMock = mockGitHubResponse(204)

      const response = await sendNewsletter(cronRequest())

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expect.objectContaining({
        dispatched: true,
        workflow: 'daily-newsletter.yml',
      }))
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/actions/workflows/daily-newsletter.yml/dispatches'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('newsletter watchdog', () => {
    it('returns 200 when direct verification succeeds', async () => {
      mocks.verifyNewsletterSent.mockResolvedValue(0)

      const response = await runWatchdog(cronRequest())

      expect(response.status).toBe(200)
      expect(mocks.verifyNewsletterSent).toHaveBeenCalledOnce()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('returns 500 when direct verification reports an unsent newsletter', async () => {
      mocks.verifyNewsletterSent.mockResolvedValue(1)

      const response = await runWatchdog(cronRequest())

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual(expect.objectContaining({
        success: false,
        reason: 'newsletter_not_sent',
      }))
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
