import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'

import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'
import {
  generateNewsletterHTML,
  parseCrashAlert,
  sendStockNewsletter,
} from '@/lib/sendgrid'
import { fetchAllRows } from '@/lib/supabase/paginate'

const CONTENT_POLL_INTERVAL_MS = 30_000
const DEFAULT_WAIT_FOR_CONTENT_MINUTES = 12
const CONFIRM_RETRY_DELAYS_MS = [500, 2_000, 6_000] as const

type NewsletterClient = ReturnType<typeof createClient>
type SendResult = Awaited<ReturnType<typeof sendStockNewsletter>>
type SendEnvironment = Readonly<Record<string, string | undefined>>

export interface SubscriberRow {
  readonly id: string | number
  readonly email: string
  readonly name: string | null
  readonly created_at: string
}

export interface NewsletterContentRow {
  readonly newsletter_date: string
  readonly gemini_analysis: string | null
  readonly picks_source: string | null
  readonly is_sent: boolean
}

export interface SendNewsletterRepository {
  fetchActiveSubscribers(): Promise<SubscriberRow[]>
  fetchContent(date: string): Promise<NewsletterContentRow | null>
  fetchUnsentContent(date: string): Promise<NewsletterContentRow | null>
  claim(date: string): Promise<void>
  rollback(date: string): Promise<void>
  confirmSent(date: string, sentAt: string, subscriberCount: number): Promise<void>
}

interface SendLogger {
  log(...values: unknown[]): void
  warn(...values: unknown[]): void
  error(...values: unknown[]): void
}

export interface SendNewsletterOptions {
  readonly targetDate?: string
  readonly dispatchId?: string
  readonly dryRun?: boolean
}

export interface SendNewsletterDependencies {
  readonly env?: SendEnvironment
  readonly repository?: SendNewsletterRepository
  readonly send?: typeof sendStockNewsletter
  readonly sendAlert?: typeof sendNewsletterAlertEmail
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly now?: () => number
  readonly logger?: SendLogger
}

function databaseError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(`Database error: ${String(error.message)}`)
  }
  return new Error(`Database error: ${String(error)}`)
}

export async function fetchActiveSubscribers(
  client: NewsletterClient,
): Promise<SubscriberRow[]> {
  return fetchAllRows<SubscriberRow>((from, to) => client
    .from('subscribers')
    .select('id, email, name, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))
}

export function createSendNewsletterRepository(
  env: SendEnvironment = process.env,
): SendNewsletterRepository {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set')
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })

  return {
    fetchActiveSubscribers: () => fetchActiveSubscribers(client),
    async fetchContent(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .select('newsletter_date, gemini_analysis, picks_source, is_sent')
        .eq('newsletter_date', date)
        .maybeSingle()
      if (error) throw databaseError(error)
      return data
    },
    async fetchUnsentContent(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .select('newsletter_date, gemini_analysis, picks_source, is_sent')
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .maybeSingle()
      if (error) throw databaseError(error)
      return data
    },
    async claim(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .update({ is_sent: true })
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .select('newsletter_date')
        .single()
      if (error || !data) {
        throw new Error(`Failed to claim newsletter content for ${date}. Sending aborted.`)
      }
    },
    async rollback(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .update({ is_sent: false })
        .eq('newsletter_date', date)
        .eq('is_sent', true)
        .select('newsletter_date')
        .single()
      if (error || !data) {
        throw error || new Error(`Newsletter content for ${date} was not rolled back.`)
      }
    },
    async confirmSent(date, sentAt, subscriberCount) {
      const { error } = await client
        .from('newsletter_content')
        .update({
          is_sent: true,
          sent_at: sentAt,
          subscriber_count: subscriberCount,
        })
        .eq('newsletter_date', date)
      if (error) throw databaseError(error)
    },
  }
}

function getTodayKst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function assertIsoDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`targetDate 형식은 YYYY-MM-DD여야 합니다: ${value}`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`targetDate가 유효한 날짜가 아닙니다: ${value}`)
  }
}

function waitForContentMinutes(env: SendEnvironment): number {
  const rawMinutes = env.SEND_WAIT_FOR_CONTENT_MINUTES
  if (rawMinutes === undefined || rawMinutes.trim() === '') {
    return DEFAULT_WAIT_FOR_CONTENT_MINUTES
  }
  const parsed = Number(rawMinutes)
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_WAIT_FOR_CONTENT_MINUTES
}

function contentIsReady(content: NewsletterContentRow | null): content is NewsletterContentRow {
  if (!content) return false
  return content.picks_source !== null || (content.gemini_analysis?.trim().length ?? 0) > 0
}

async function waitForPreparedContent(input: {
  readonly repository: SendNewsletterRepository
  readonly targetDate: string
  readonly dispatchId: string
  readonly waitMinutes: number
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly now: () => number
  readonly logger: SendLogger
}): Promise<NewsletterContentRow> {
  const deadline = input.now() + input.waitMinutes * 60_000
  let poll = 0

  for (;;) {
    const content = await input.repository.fetchUnsentContent(input.targetDate)
    if (contentIsReady(content)) return content
    const remainingMs = deadline - input.now()
    if (remainingMs <= 0) {
      throw new Error(
        `Newsletter content for ${input.targetDate} not found. Please run prepare-newsletter first.`,
      )
    }

    poll += 1
    input.logger.log(JSON.stringify({
      event: 'send_waiting_for_content',
      targetDate: input.targetDate,
      dispatchId: input.dispatchId,
      poll,
      remainingSec: Math.ceil(remainingMs / 1_000),
    }))
    await input.sleep(Math.min(CONTENT_POLL_INTERVAL_MS, remainingMs))
  }
}

async function rollbackClaim(input: {
  readonly repository: SendNewsletterRepository
  readonly targetDate: string
  readonly logger: SendLogger
  readonly context: string
}): Promise<void> {
  try {
    await input.repository.rollback(input.targetDate)
    input.logger.log(`↩️ ${input.context}로 is_sent=false 롤백 완료`)
  } catch (rollbackError) {
    input.logger.error(`🚨 ${input.context} 후 is_sent 롤백 실패:`, rollbackError)
  }
}

async function confirmSentWithRetry(input: {
  readonly repository: SendNewsletterRepository
  readonly targetDate: string
  readonly sentAt: string
  readonly subscriberCount: number
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly logger: SendLogger
}): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt <= CONFIRM_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await input.repository.confirmSent(
        input.targetDate,
        input.sentAt,
        input.subscriberCount,
      )
      return
    } catch (error) {
      lastError = error
      const retryDelay = CONFIRM_RETRY_DELAYS_MS[attempt]
      if (retryDelay === undefined) break
      input.logger.warn(`발송 완료 DB 업데이트 재시도 ${attempt + 1}/3`)
      await input.sleep(retryDelay)
    }
  }
  input.logger.error('⚠️ DB 업데이트 실패 (뉴스레터는 정상 발송됨):', lastError)
}

function koreanDateLabel(targetDate: string): string {
  return new Date(`${targetDate}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

function sendSummary(input: {
  readonly targetDate: string
  readonly dispatchId: string
  readonly subscribers: number
  readonly result: SendResult
  readonly startedAt: number
  readonly now: () => number
}): string {
  return JSON.stringify({
    event: 'send_run_summary',
    targetDate: input.targetDate,
    dispatchId: input.dispatchId,
    subscribers: input.subscribers,
    sent: input.result.sent,
    failed: input.result.failed.length,
    durationSec: Math.round((input.now() - input.startedAt) / 100) / 10,
  })
}

export async function runSendNewsletter(
  options: SendNewsletterOptions = {},
  dependencies: SendNewsletterDependencies = {},
): Promise<0 | 1> {
  const env = dependencies.env ?? process.env
  const logger = dependencies.logger ?? console
  const now = dependencies.now ?? Date.now
  const sleep = dependencies.sleep
    ?? ((milliseconds: number) => new Promise<void>((resolveSleep) => {
      setTimeout(resolveSleep, milliseconds)
    }))
  const targetDate = options.targetDate || getTodayKst()
  const dispatchId = options.dispatchId || env.DISPATCH_ID || ''
  const startedAt = now()
  assertIsoDate(targetDate)

  logger.log('🚀 뉴스레터 발송 작업 시작...')
  logger.log(`📅 target_date=${targetDate} dispatch_id=${dispatchId || 'none'}`)

  try {
    const repository = dependencies.repository ?? createSendNewsletterRepository(env)
    logger.log('📊 Supabase에서 구독자 가져오는 중...')
    const subscribers = await repository.fetchActiveSubscribers()

    if (subscribers.length === 0 && !options.dryRun) {
      logger.warn('⚠️ 활성 구독자가 없습니다.')
      logger.log(JSON.stringify({
        event: 'send_skipped',
        reason: 'no_active_subscribers',
      }))
      await (dependencies.sendAlert ?? sendNewsletterAlertEmail)({
        subject: `[Stock Matrix] ${targetDate} 활성 구독자 0명 — 발송 생략`,
        lines: [
          `target_date: ${targetDate}`,
          `dispatch_id: ${dispatchId || 'none'}`,
          'subscribers 테이블과 구독 상태를 확인하세요.',
        ],
        env,
      })
      return 0
    }

    logger.log(`✅ ${subscribers.length}명의 구독자 발견`)
    let newsletterContent: NewsletterContentRow
    if (options.dryRun) {
      const content = await repository.fetchContent(targetDate)
      if (!contentIsReady(content)) {
        throw new Error(
          `Newsletter content for ${targetDate} not found. Please run prepare-newsletter first.`,
        )
      }
      newsletterContent = content
    } else {
      newsletterContent = await waitForPreparedContent({
        repository,
        targetDate,
        dispatchId,
        waitMinutes: waitForContentMinutes(env),
        sleep,
        now,
        logger,
      })
    }
    logger.log('✅ 뉴스레터 콘텐츠 로드 완료')

    if (options.dryRun) {
      const firstRecipient = subscribers[0]
      const html = firstRecipient
        ? generateNewsletterHTML({
            geminiAnalysis: newsletterContent.gemini_analysis ?? '',
            date: koreanDateLabel(targetDate),
          }, firstRecipient.email)
        : ''
      logger.log(JSON.stringify({
        event: 'send_dry_run',
        targetDate,
        subscribers: subscribers.length,
        isSent: newsletterContent.is_sent,
        picksSource: newsletterContent.picks_source,
        htmlBytes: Buffer.byteLength(html, 'utf8'),
        isCrash: parseCrashAlert(newsletterContent.gemini_analysis ?? '') !== null,
      }))
      return 0
    }

    logger.log('🔒 뉴스레터 발송 상태 선점 중...')
    await repository.claim(targetDate)
    logger.log('✅ 뉴스레터 발송 상태 선점 완료')

    let result: SendResult
    try {
      result = await (dependencies.send ?? sendStockNewsletter)(
        subscribers.map((subscriber) => ({
          email: subscriber.email,
          name: subscriber.name || undefined,
        })),
        {
          geminiAnalysis: newsletterContent.gemini_analysis ?? '',
          date: koreanDateLabel(targetDate),
        },
      )
    } catch (sendError) {
      await rollbackClaim({
        repository,
        targetDate,
        logger,
        context: '발송 실패',
      })
      throw sendError
    }

    if (result.failed.length > 0) {
      logger.error(`❌ 이메일 발송 실패 수: ${result.failed.length}명`)
      logger.error('실패 대상 (인덱스/도메인만):', result.failed)
    }
    logger.log(sendSummary({
      targetDate,
      dispatchId,
      subscribers: subscribers.length,
      result,
      startedAt,
      now,
    }))
    if (result.sent === 0) {
      await rollbackClaim({
        repository,
        targetDate,
        logger,
        context: '전량 발송 실패',
      })
      throw new Error(`전체 이메일 발송 실패: 0/${subscribers.length}명 성공`)
    }

    logger.log(`📬 발송 성공 ${result.sent}명, 실패 ${result.failed.length}명, 재시도 ${result.retried}회`)
    await confirmSentWithRetry({
      repository,
      targetDate,
      sentAt: new Date(now()).toISOString(),
      subscriberCount: result.sent,
      sleep,
      logger,
    })
    return result.failed.length > 0 ? 1 : 0
  } catch (error) {
    logger.error('❌ 뉴스레터 발송 실패:', error)
    return 1
  }
}

function readOption(args: readonly string[], name: string): string | undefined {
  const inline = args.find((argument) => argument.startsWith(`${name}=`))
  return inline?.slice(name.length + 1)
}

export function parseSendNewsletterCliArgs(args: readonly string[]): SendNewsletterOptions {
  return {
    targetDate: readOption(args, '--target-date'),
    dispatchId: readOption(args, '--dispatch-id'),
    dryRun: args.includes('--dry-run'),
  }
}

const isDirectRun = /send-newsletter\.(?:ts|js)$/.test(process.argv[1] ?? '')
if (isDirectRun) {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) loadDotenv({ path: envPath, quiet: true })

  runSendNewsletter(parseSendNewsletterCliArgs(process.argv.slice(2)))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      console.error('뉴스레터 발송 중 예기치 않은 오류:', error)
      process.exitCode = 1
    })
}
