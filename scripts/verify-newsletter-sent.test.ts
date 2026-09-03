import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyNewsletterDeliveryCounts } from '@/lib/newsletter/delivery'
import {
  DEFAULT_NEWSLETTER_ALERT_EMAIL,
  verifyNewsletterSent,
  type NewsletterAlertEmail,
  type NewsletterStatusRow,
} from './verify-newsletter-sent'

const TODAY_KST = '2026-08-31'

function newsletterStatus(
  input: Partial<NewsletterStatusRow> = {},
): NewsletterStatusRow {
  return {
    is_sent: false,
    picks_source: 'code',
    sent_at: null,
    subscriber_count: null,
    gemini_analysis: '[]',
    sending_owner: null,
    sending_lease_until: null,
    sending_started_at: null,
    ...input,
  }
}

function makeDependencies(input: {
  readonly tradingDay?: boolean
  readonly newsletter?: NewsletterStatusRow | null
  readonly sendgridApiKey?: string
  readonly activeSubscriberCount?: number
  readonly deliveryCounts?: Partial<ReturnType<typeof emptyNewsletterDeliveryCounts>>
}) {
  const fetchNewsletter = vi.fn(async () => input.newsletter ?? null)
  const sendAlertEmail = vi.fn(async (email: NewsletterAlertEmail) => {
    void email
  })
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const countActiveSubscribers = vi.fn(async () => (
    input.activeSubscriberCount ?? input.newsletter?.subscriber_count ?? 0
  ))
  const countDeliveriesByStatus = vi.fn(async () => ({
    ...emptyNewsletterDeliveryCounts(),
    ...input.deliveryCounts,
  }))
  const env = {
    SENDGRID_API_KEY: input.sendgridApiKey,
    SENDGRID_FROM_EMAIL: 'alerts@stockmatrix.co.kr',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'MongLong0214/stock-ai-newsletter',
  }

  return {
    dependencies: {
      getTodayKst: () => TODAY_KST,
      isTradingDay: () => input.tradingDay ?? true,
      fetchNewsletter,
      countActiveSubscribers,
      countDeliveriesByStatus,
      sendAlertEmail,
      env,
      logger,
      now: () => Date.parse('2026-08-31T00:00:00.000Z'),
    },
    fetchNewsletter,
    sendAlertEmail,
    logger,
    countActiveSubscribers,
    countDeliveriesByStatus,
  }
}

describe('newsletter sent watchdog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips verification on a Korean market holiday', async () => {
    const setup = makeDependencies({ tradingDay: false })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.logger.log).toHaveBeenCalledWith(`${TODAY_KST} 휴장일 — 검증 생략`)
    expect(setup.fetchNewsletter).not.toHaveBeenCalled()
    expect(setup.sendAlertEmail).not.toHaveBeenCalled()
  })

  it('reports a fatal error when the newsletter row does not exist', async () => {
    const setup = makeDependencies({ newsletter: null, sendgridApiKey: 'test-sendgrid-key' })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: DEFAULT_NEWSLETTER_ALERT_EMAIL,
      subject: expect.stringContaining('발행 파이프라인 미실행'),
    }))
  })

  it('reports ready but unsent when no delivery ledger rows exist', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus(),
      sendgridApiKey: 'test-sendgrid-key',
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('준비됐으나 미발송'),
      text: expect.stringContaining('원인: 준비됐으나 미발송'),
    }))
  })

  it('reports retryable and pending counts for a stale incomplete delivery', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus({
        sending_owner: 'stale-run',
        sending_lease_until: '2026-08-30T23:00:00.000Z',
        sending_started_at: '2026-08-30T22:30:00.000Z',
      }),
      deliveryCounts: { accepted: 7, failedRetryable: 2, pending: 3 },
      sendgridApiKey: 'test-sendgrid-key',
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('발송 미완료 (재시도 대기: retryable=2, pending=3)'),
    }))
  })

  it('also reports an incomplete delivery after the lease was released', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus({ sending_lease_until: null }),
      deliveryCounts: { failedRetryable: 1 },
      sendgridApiKey: 'test-sendgrid-key',
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('retryable=1, pending=0'),
    }))
  })

  it('returns success for a sent code-picks newsletter', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus({
        is_sent: true,
        sent_at: '2026-08-31T00:00:00.000Z',
        subscriber_count: 10,
      }),
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.logger.log).toHaveBeenCalledWith(`✅ ${TODAY_KST} 뉴스레터 발송 확인`)
    expect(setup.logger.warn).not.toHaveBeenCalled()
  })

  it('warns about unknown and terminal ledger rows after completion', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus({
        is_sent: true,
        sent_at: '2026-08-31T00:00:00.000Z',
        subscriber_count: 10,
      }),
      deliveryCounts: { unknown: 2, failedTerminal: 1, accepted: 10 },
      activeSubscriberCount: 10,
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.logger.warn).toHaveBeenCalledWith(
      `⚠️ ${TODAY_KST} 뉴스레터 delivery 경고: unknown=2, failed_terminal=1`,
    )
  })

  it('keeps the active subscriber count warning', async () => {
    const setup = makeDependencies({
      newsletter: newsletterStatus({
        is_sent: true,
        subscriber_count: 9,
      }),
      activeSubscriberCount: 10,
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.countActiveSubscribers).toHaveBeenCalledOnce()
    expect(setup.logger.warn).toHaveBeenCalledWith(
      '⚠️ subscriber_count(9) < active subscribers(10)',
    )
  })
})
