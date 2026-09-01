import sgMail from '@sendgrid/mail'

import { isKoreanTradingDate } from '@/lib/tli/trading-calendar'
import {
  getNewsletterStatus,
  type NewsletterStatusRow,
} from '@/lib/newsletter/status'

export { type NewsletterStatusRow } from '@/lib/newsletter/status'

export const DEFAULT_NEWSLETTER_ALERT_EMAIL = 'wonil@mdbtech.co.kr'

const DEFAULT_ACTIONS_URL =
  'https://github.com/MongLong0214/stock-ai-newsletter/actions/workflows/daily-newsletter.yml'

export interface NewsletterAlertEmail {
  readonly apiKey: string
  readonly to: string
  readonly from: string
  readonly subject: string
  readonly text: string
}

interface WatchdogLogger {
  log(message: string): void
  warn(message: string): void
  error(message: string): void
}

type WatchdogEnvironment = Readonly<Record<string, string | undefined>>

export interface NewsletterWatchdogDependencies {
  readonly getTodayKst?: () => string
  readonly isTradingDay?: (date: string) => boolean
  readonly fetchNewsletter?: (date: string) => Promise<NewsletterStatusRow | null>
  readonly sendAlertEmail?: (email: NewsletterAlertEmail) => Promise<void>
  readonly env?: WatchdogEnvironment
  readonly logger?: WatchdogLogger
}

function getTodayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function getActionsUrl(env: WatchdogEnvironment): string {
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY) {
    return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/workflows/daily-newsletter.yml`
  }
  return DEFAULT_ACTIONS_URL
}

async function sendAlertEmail(email: NewsletterAlertEmail): Promise<void> {
  sgMail.setApiKey(email.apiKey)
  await sgMail.send({
    to: email.to,
    from: email.from,
    subject: email.subject,
    text: email.text,
  })
}

async function reportFatal(input: {
  readonly date: string
  readonly reason: string
  readonly dependencies: NewsletterWatchdogDependencies
}): Promise<1> {
  const env = input.dependencies.env ?? process.env
  const logger = input.dependencies.logger ?? console
  const apiKey = env.SENDGRID_API_KEY
  const from = env.SENDGRID_FROM_EMAIL

  logger.error(`🚨 ${input.date} 뉴스레터 발송 누락: ${input.reason}`)

  if (!apiKey) {
    logger.error('SENDGRID_API_KEY 없음 — 알림 메일을 시도하지 않습니다.')
    return 1
  }
  if (!from) {
    logger.error('SENDGRID_FROM_EMAIL 없음 — 알림 메일을 시도하지 않습니다.')
    return 1
  }

  const actionsUrl = getActionsUrl(env)
  const to = env.NEWSLETTER_ALERT_EMAIL || DEFAULT_NEWSLETTER_ALERT_EMAIL
  const email: NewsletterAlertEmail = {
    apiKey,
    to,
    from,
    subject: `[Stock Matrix] ${input.date} 뉴스레터 발송 누락 — ${input.reason}`,
    text: [
      'Stock Matrix 뉴스레터 발송 누락 워치독 알림',
      `KST 날짜: ${input.date}`,
      `원인: ${input.reason}`,
      `조치 링크: ${actionsUrl}`,
    ].join('\n'),
  }

  try {
    await (input.dependencies.sendAlertEmail ?? sendAlertEmail)(email)
    logger.log(`📨 발송 누락 알림 메일 전송 완료: ${to}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`알림 메일 전송 실패: ${message}`)
  }

  return 1
}

export async function verifyNewsletterSent(
  dependencies: NewsletterWatchdogDependencies = {},
): Promise<0 | 1> {
  const env = dependencies.env ?? process.env
  const logger = dependencies.logger ?? console
  const date = (dependencies.getTodayKst ?? getTodayKst)()
  const tradingDay = (dependencies.isTradingDay ?? isKoreanTradingDate)(date)

  if (!tradingDay) {
    logger.log(`${date} 휴장일 — 검증 생략`)
    return 0
  }

  let newsletter: NewsletterStatusRow | null
  try {
    newsletter = await (
      dependencies.fetchNewsletter ?? ((targetDate) => getNewsletterStatus(targetDate, env))
    )(date)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reportFatal({
      date,
      reason: `상태 조회 실패 (${message})`,
      dependencies,
    })
  }

  if (!newsletter) {
    return reportFatal({ date, reason: '발행 파이프라인 미실행', dependencies })
  }
  if (!newsletter.is_sent) {
    return reportFatal({ date, reason: '준비됐으나 미발송', dependencies })
  }

  logger.log(`✅ ${date} 뉴스레터 발송 확인`)
  if (newsletter.picks_source !== 'code') {
    logger.warn(
      `⚠️ ${date} 뉴스레터는 발송됐지만 picks_source=${newsletter.picks_source ?? 'null'} 입니다.`,
    )
  }
  return 0
}
