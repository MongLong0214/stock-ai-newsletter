import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NEWSLETTER_ALERT_EMAIL,
  verifyNewsletterSent,
  type NewsletterAlertEmail,
  type NewsletterStatusRow,
} from './verify-newsletter-sent'

const TODAY_KST = '2026-08-31'

function makeDependencies(input: {
  readonly tradingDay?: boolean
  readonly newsletter?: NewsletterStatusRow | null
  readonly sendgridApiKey?: string
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
      sendAlertEmail,
      env,
      logger,
    },
    fetchNewsletter,
    sendAlertEmail,
    logger,
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

  it('reports a fatal error when today\'s row does not exist', async () => {
    const setup = makeDependencies({ newsletter: null, sendgridApiKey: 'test-sendgrid-key' })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledOnce()
    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: DEFAULT_NEWSLETTER_ALERT_EMAIL,
      subject: expect.stringContaining(`${TODAY_KST} 뉴스레터 발송 누락 — 발행 파이프라인 미실행`),
      text: expect.stringMatching(
        new RegExp(`${TODAY_KST}.*발행 파이프라인 미실행.*actions/workflows/daily-newsletter\\.yml`, 's'),
      ),
    }))
  })

  it('reports a fatal error when today\'s row is not sent', async () => {
    const setup = makeDependencies({
      newsletter: { is_sent: false, picks_source: 'code' },
      sendgridApiKey: 'test-sendgrid-key',
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('준비됐으나 미발송'),
      text: expect.stringContaining('원인: 준비됐으나 미발송'),
    }))
  })

  it('returns success for a sent code-picks newsletter', async () => {
    const setup = makeDependencies({
      newsletter: { is_sent: true, picks_source: 'code' },
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.logger.log).toHaveBeenCalledWith(`✅ ${TODAY_KST} 뉴스레터 발송 확인`)
    expect(setup.logger.warn).not.toHaveBeenCalled()
    expect(setup.sendAlertEmail).not.toHaveBeenCalled()
  })

  it("warns but returns success for a sent newsletter with picks_source='llm_fallback'", async () => {
    const setup = makeDependencies({
      newsletter: { is_sent: true, picks_source: 'llm_fallback' },
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(0)

    expect(setup.logger.warn).toHaveBeenCalledOnce()
    expect(setup.logger.warn).toHaveBeenCalledWith(
      `⚠️ ${TODAY_KST} 뉴스레터는 발송됐지만 picks_source=llm_fallback 입니다.`,
    )
    expect(setup.sendAlertEmail).not.toHaveBeenCalled()
  })

  it('returns failure without attempting email when the SendGrid key is missing', async () => {
    const setup = makeDependencies({
      newsletter: { is_sent: false, picks_source: 'code' },
    })

    await expect(verifyNewsletterSent(setup.dependencies)).resolves.toBe(1)

    expect(setup.sendAlertEmail).not.toHaveBeenCalled()
    expect(setup.logger.error).toHaveBeenCalledWith(
      'SENDGRID_API_KEY 없음 — 알림 메일을 시도하지 않습니다.',
    )
  })
})
