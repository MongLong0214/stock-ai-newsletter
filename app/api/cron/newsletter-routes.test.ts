import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDispatchId: vi.fn((date: string) => `${date}-fixture`),
  dispatchGitHubWorkflow: vi.fn(),
  getNewsletterStatus: vi.fn(),
  isKoreanTradingDate: vi.fn(),
  sendNewsletterAlertEmail: vi.fn(),
  verifyNewsletterSent: vi.fn(),
}))

vi.mock('@/lib/github-actions-dispatch', () => ({
  createDispatchId: mocks.createDispatchId,
  dispatchGitHubWorkflow: mocks.dispatchGitHubWorkflow,
}))

vi.mock('@/lib/newsletter/alert', () => ({
  sendNewsletterAlertEmail: mocks.sendNewsletterAlertEmail,
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
import { GET as backupPrepareNewsletter } from './newsletter-prepare/backup/route'
import { GET as sendNewsletter } from './newsletter-send/route'
import { GET as retrySendNewsletter } from './newsletter-send/retry/route'
import { GET as runWatchdog } from './newsletter-watchdog/route'
import { GET as runPreparedWatchdog } from './newsletter-watchdog/prepared/route'

const CRON_SECRET = 'test-cron-secret'
const originalCronSecret = process.env.CRON_SECRET

function cronRequest(token: string | null = CRON_SECRET): Request {
  const headers = token === null ? undefined : { Authorization: `Bearer ${token}` }
  return new Request('http://localhost/api/cron/newsletter', { headers })
}

function status(input: {
  isSent?: boolean
  picksSource?: string | null
  sentAt?: string | null
} = {}) {
  return {
    is_sent: input.isSent ?? false,
    picks_source: input.picksSource ?? 'code',
    sent_at: input.sentAt !== undefined
      ? input.sentAt
      : input.isSent ? '2026-09-02T00:00:00.000Z' : null,
    subscriber_count: input.isSent ? 42 : null,
  }
}

describe('newsletter Vercel cron routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    mocks.isKoreanTradingDate.mockReturnValue(true)
    mocks.getNewsletterStatus.mockResolvedValue(null)
    mocks.verifyNewsletterSent.mockResolvedValue(0)
    mocks.sendNewsletterAlertEmail.mockResolvedValue(true)
    mocks.dispatchGitHubWorkflow.mockImplementation(async (
      _workflowFile: string,
      options: { inputs?: Record<string, string | boolean> },
    ) => ({
      dispatchId: options.inputs?.dispatch_id,
      tokenExpiresInDays: null,
      verified: true,
    }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCronSecret
  })

  it('fails closed with 401 when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(401)
    expect(mocks.isKoreanTradingDate).not.toHaveBeenCalled()
  })

  it('returns 401 for an invalid Bearer token', async () => {
    const response = await prepareNewsletter(cronRequest('wrong-secret'))

    expect(response.status).toBe(401)
    expect(mocks.isKoreanTradingDate).not.toHaveBeenCalled()
  })

  it('lets a valid Bearer token reach the trading-day check', async () => {
    mocks.isKoreanTradingDate.mockReturnValue(false)

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.isKoreanTradingDate).toHaveBeenCalledOnce()
  })

  it.each([
    ['prepare', prepareNewsletter],
    ['backup prepare', backupPrepareNewsletter],
    ['send', sendNewsletter],
    ['retry send', retrySendNewsletter],
    ['prepared watchdog', runPreparedWatchdog],
    ['sent watchdog', runWatchdog],
  ])('skips the %s route on a non-trading day', async (_name, handler) => {
    mocks.isKoreanTradingDate.mockReturnValue(false)

    const response = await handler(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'non_trading_day',
    }))
    expect(mocks.getNewsletterStatus).not.toHaveBeenCalled()
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches primary prepare with target date and correlation ID', async () => {
    mocks.getNewsletterStatus.mockResolvedValue(status({ picksSource: 'llm_fallback' }))

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      dispatched: true,
      dispatchId: expect.stringMatching(/-fixture$/),
      verified: true,
    }))
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'prepare-newsletter.yml',
      { inputs: expect.objectContaining({
        target_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        dispatch_id: expect.stringMatching(/-fixture$/),
      }) },
    )
  })

  it('alerts when the dispatch token has fewer than 14 days remaining', async () => {
    mocks.dispatchGitHubWorkflow.mockResolvedValue({
      dispatchId: 'expiry-fixture',
      tokenExpiresInDays: 3,
      verified: true,
    })

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.sendNewsletterAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('PAT 만료 D-3'),
    }))
  })

  it('returns 200 with verified false when dispatch was acknowledged but not visible yet', async () => {
    mocks.dispatchGitHubWorkflow.mockResolvedValue({
      dispatchId: 'unverified-fixture',
      tokenExpiresInDays: null,
      verified: false,
    })

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      dispatched: true,
      dispatchId: 'unverified-fixture',
      verified: false,
    }))
  })

  it.each([
    [status({ picksSource: 'code' }), 'code_picks_exist'],
    [status({ isSent: true, picksSource: 'llm_fallback' }), 'already_sent'],
  ])('skips primary prepare for an existing terminal row', async (newsletter, reason) => {
    mocks.getNewsletterStatus.mockResolvedValue(newsletter)

    const response = await prepareNewsletter(cronRequest())

    expect(await response.json()).toEqual(expect.objectContaining({ skipped: true, reason }))
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it.each([
    [status({ picksSource: 'code' }), 'code_picks_exist'],
    [status({ isSent: true, picksSource: 'llm_fallback' }), 'already_sent'],
  ])('skips backup prepare when recovery is unnecessary', async (newsletter, reason) => {
    mocks.getNewsletterStatus.mockResolvedValue(newsletter)

    const response = await backupPrepareNewsletter(cronRequest())

    expect(await response.json()).toEqual(expect.objectContaining({ skipped: true, reason }))
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing row', null],
    ['a fallback row', status({ picksSource: 'llm_fallback' })],
  ])('dispatches backup prepare for %s', async (_description, newsletter) => {
    mocks.getNewsletterStatus.mockResolvedValue(newsletter)

    const response = await backupPrepareNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'prepare-newsletter.yml',
      { inputs: expect.objectContaining({ backup_run: true }) },
    )
  })

  it('marks the prepared watchdog red and alerts when content is missing', async () => {
    const response = await runPreparedWatchdog(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(expect.objectContaining({
      reason: 'content_not_prepared',
    }))
    expect(mocks.sendNewsletterAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('콘텐츠 미준비 (07:05)'),
    }))
  })

  it('warns about fallback content but keeps the prepared watchdog green', async () => {
    mocks.getNewsletterStatus.mockResolvedValue(status({ picksSource: 'llm_fallback' }))

    const response = await runPreparedWatchdog(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.sendNewsletterAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('LLM fallback 콘텐츠로 발송 예정'),
    }))
  })

  it('keeps crash-alert content green without sending a fallback alert', async () => {
    mocks.getNewsletterStatus.mockResolvedValue(status({ picksSource: 'crash' }))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const response = await runPreparedWatchdog(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.sendNewsletterAlertEmail).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('crash_alert_content'))
  })

  it.each([
    ['a missing row', null, 'not_prepared'],
    ['an already confirmed row', status({ isSent: true }), 'already_sent'],
  ])('skips primary send for %s', async (_description, newsletter, reason) => {
    mocks.getNewsletterStatus.mockResolvedValue(newsletter)

    const response = await sendNewsletter(cronRequest())

    expect(await response.json()).toEqual(expect.objectContaining({ skipped: true, reason }))
    expect(mocks.dispatchGitHubWorkflow).not.toHaveBeenCalled()
  })

  it('dispatches primary send for an unconfirmed claim with the recovery reason', async () => {
    mocks.getNewsletterStatus.mockResolvedValue(status({ isSent: true, sentAt: null }))

    const response = await sendNewsletter(cronRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      dispatched: true,
      reason: 'recover_unconfirmed_claim',
      verified: true,
    }))
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledOnce()
  })

  it('uses the second send slot idempotently after the first claim', async () => {
    mocks.getNewsletterStatus
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ isSent: true }))

    const first = await sendNewsletter(cronRequest())
    const retry = await retrySendNewsletter(cronRequest())

    expect(first.status).toBe(200)
    expect(await retry.json()).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'already_sent',
    }))
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledOnce()
    expect(mocks.dispatchGitHubWorkflow).toHaveBeenCalledWith(
      'daily-newsletter.yml',
      { inputs: expect.objectContaining({
        target_date: expect.any(String),
        dispatch_id: expect.stringMatching(/-fixture$/),
      }) },
    )
  })

  it('returns 500 when direct sent verification fails', async () => {
    mocks.verifyNewsletterSent.mockResolvedValue(1)

    const response = await runWatchdog(cronRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual(expect.objectContaining({
      reason: 'newsletter_not_sent',
    }))
  })

  it.each([401, 422])('returns 500 when GitHub dispatch responds %i and preserves body in the logged error', async (httpStatus) => {
    const dispatchError = Object.assign(new Error(`GitHub workflow dispatch failed (${httpStatus})`), {
      status: httpStatus,
      responseBody: `fixture-body-${httpStatus}`,
    })
    mocks.dispatchGitHubWorkflow.mockRejectedValue(dispatchError)

    const response = await prepareNewsletter(cronRequest())

    expect(response.status).toBe(500)
    expect(console.error).toHaveBeenCalledWith(
      'Newsletter prepare cron failed:',
      expect.objectContaining({
        status: httpStatus,
        responseBody: `fixture-body-${httpStatus}`,
      }),
    )
  })
})
