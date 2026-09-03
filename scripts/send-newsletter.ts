import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'

import { siteConfig } from '@/lib/constants/seo/config'
import {
  countNewsletterDeliveryStatuses,
  type NewsletterDeliveryCounts,
  type NewsletterDeliveryStatus,
} from '@/lib/newsletter/delivery'
import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'
import {
  generateNewsletterHTML,
  parseCrashAlert,
  sendStockNewsletter,
  type EmailRecipient,
  type StockNewsletterDeliveryOutcome,
} from '@/lib/sendgrid'
import { fetchAllRows } from '@/lib/supabase/paginate'

const CONTENT_POLL_INTERVAL_MS = 30_000
const DEFAULT_WAIT_FOR_CONTENT_MINUTES = 12
const DEFAULT_SEND_DEADLINE_MINUTES = 15
const LEASE_DURATION_MS = 20 * 60_000
const LEASE_RENEW_INTERVAL_MS = 5 * 60_000
const DELIVERY_UPSERT_BATCH_SIZE = 500
const DELIVERY_WRITE_BATCH_SIZE = 50
const DELIVERY_WRITE_FLUSH_MS = 2_000
const CONFIRM_RETRY_DELAYS_MS = [500, 2_000, 6_000] as const

type NewsletterClient = ReturnType<typeof createClient>
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
  readonly sent_at: string | null
  readonly sending_owner: string | null
  readonly sending_lease_until: string | null
  readonly sending_started_at: string | null
}

export interface NewsletterDeliveryRow {
  readonly newsletter_date: string
  readonly subscriber_id: string
  readonly email_domain: string
  readonly status: NewsletterDeliveryStatus
  readonly attempt_count: number
  readonly last_error_code: string | null
  readonly provider_message_id: string | null
  readonly accepted_at: string | null
  readonly updated_at: string
}

export interface NewsletterDeliveryWrite {
  readonly newsletter_date: string
  readonly subscriber_id: string
  readonly email_domain: string
  readonly status: NewsletterDeliveryStatus
  readonly attempt_count: number
  readonly last_error_code: string | null
  readonly provider_message_id: string | null
  readonly accepted_at: string | null
  readonly updated_at: string
}

export interface NewsletterLedgerSnapshot {
  readonly inserted: number
  readonly existing: number
}

export interface SendNewsletterRepository {
  fetchActiveSubscribers(): Promise<SubscriberRow[]>
  fetchContent(date: string): Promise<NewsletterContentRow | null>
  fetchSendableContent(date: string): Promise<NewsletterContentRow | null>
  acquireLease(input: {
    readonly date: string
    readonly runId: string
    readonly nowIso: string
    readonly leaseUntilIso: string
    readonly sendingStartedAt: string
  }): Promise<boolean>
  renewLease(date: string, runId: string, leaseUntilIso: string): Promise<boolean>
  releaseLease(date: string, runId: string): Promise<void>
  snapshotDeliveries(
    date: string,
    subscribers: readonly SubscriberRow[],
    updatedAt: string,
  ): Promise<NewsletterLedgerSnapshot>
  fetchDeliveriesToSend(date: string): Promise<NewsletterDeliveryRow[]>
  countDeliveries(date: string): Promise<NewsletterDeliveryCounts>
  writeDeliveryUpdates(updates: readonly NewsletterDeliveryWrite[]): Promise<void>
  confirmSent(
    date: string,
    runId: string,
    sentAt: string,
    subscriberCount: number,
  ): Promise<void>
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
  readonly deliveryWriteFlushMs?: number
  readonly leaseRenewIntervalMs?: number
}

function databaseError(error: unknown): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    return new Error(`Database error: ${String(error.message)}`)
  }
  return new Error(`Database error: ${String(error)}`)
}

function emailDomain(email: string): string {
  const separator = email.lastIndexOf('@')
  return separator >= 0 && separator < email.length - 1
    ? email.slice(separator + 1).toLowerCase()
    : 'unknown'
}

function chunksOf<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
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
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
  })
  const contentColumns = [
    'newsletter_date',
    'gemini_analysis',
    'picks_source',
    'is_sent',
    'sent_at',
    'sending_owner',
    'sending_lease_until',
    'sending_started_at',
  ].join(', ')

  return {
    fetchActiveSubscribers: () => fetchActiveSubscribers(client),
    async fetchContent(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .select(contentColumns)
        .eq('newsletter_date', date)
        .maybeSingle()
      if (error) throw databaseError(error)
      return data
    },
    async fetchSendableContent(date) {
      const { data, error } = await client
        .from('newsletter_content')
        .select(contentColumns)
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .maybeSingle()
      if (error) throw databaseError(error)
      return data
    },
    async acquireLease(input) {
      const { data, error } = await client
        .from('newsletter_content')
        .update({
          sending_owner: input.runId,
          sending_lease_until: input.leaseUntilIso,
          sending_started_at: input.sendingStartedAt,
        })
        .eq('newsletter_date', input.date)
        .eq('is_sent', false)
        .or(`sending_lease_until.is.null,sending_lease_until.lt.${input.nowIso}`)
        .select('newsletter_date')
      if (error) throw databaseError(error)
      return (data?.length ?? 0) > 0
    },
    async renewLease(date, runId, leaseUntilIso) {
      const { data, error } = await client
        .from('newsletter_content')
        .update({ sending_lease_until: leaseUntilIso })
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .eq('sending_owner', runId)
        .select('newsletter_date')
      if (error) throw databaseError(error)
      return (data?.length ?? 0) > 0
    },
    async releaseLease(date, runId) {
      const { error } = await client
        .from('newsletter_content')
        .update({ sending_owner: null, sending_lease_until: null })
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .eq('sending_owner', runId)
      if (error) throw databaseError(error)
    },
    async snapshotDeliveries(date, subscribers, updatedAt) {
      const existingRows = await fetchAllRows<{ readonly subscriber_id: string }>((from, to) => client
        .from('newsletter_deliveries')
        .select('subscriber_id')
        .eq('newsletter_date', date)
        .range(from, to))
      const existingIds = new Set(existingRows.map((row) => row.subscriber_id))
      const rows = subscribers.map((subscriber) => ({
        newsletter_date: date,
        subscriber_id: String(subscriber.id),
        email_domain: emailDomain(subscriber.email),
        status: 'pending' as const,
        updated_at: updatedAt,
      }))
      for (const chunk of chunksOf(rows, DELIVERY_UPSERT_BATCH_SIZE)) {
        const { error } = await client
          .from('newsletter_deliveries')
          .upsert(chunk, {
            onConflict: 'newsletter_date,subscriber_id',
            ignoreDuplicates: true,
          })
        if (error) throw databaseError(error)
      }
      const existing = subscribers.filter((subscriber) => existingIds.has(String(subscriber.id))).length
      return { inserted: subscribers.length - existing, existing }
    },
    async fetchDeliveriesToSend(date) {
      return fetchAllRows<NewsletterDeliveryRow>((from, to) => client
        .from('newsletter_deliveries')
        .select([
          'newsletter_date',
          'subscriber_id',
          'email_domain',
          'status',
          'attempt_count',
          'last_error_code',
          'provider_message_id',
          'accepted_at',
          'updated_at',
        ].join(', '))
        .eq('newsletter_date', date)
        .in('status', ['pending', 'failed_retryable'])
        .order('subscriber_id', { ascending: true })
        .range(from, to))
    },
    async countDeliveries(date) {
      const rows = await fetchAllRows<{ readonly status: NewsletterDeliveryStatus }>((from, to) => client
        .from('newsletter_deliveries')
        .select('status')
        .eq('newsletter_date', date)
        .range(from, to))
      return countNewsletterDeliveryStatuses(rows)
    },
    async writeDeliveryUpdates(updates) {
      for (const chunk of chunksOf(updates, DELIVERY_WRITE_BATCH_SIZE)) {
        const { error } = await client
          .from('newsletter_deliveries')
          .upsert(chunk, { onConflict: 'newsletter_date,subscriber_id' })
        if (error) throw databaseError(error)
      }
    },
    async confirmSent(date, runId, sentAt, subscriberCount) {
      const { data, error } = await client
        .from('newsletter_content')
        .update({
          is_sent: true,
          sent_at: sentAt,
          subscriber_count: subscriberCount,
          sending_owner: null,
          sending_lease_until: null,
        })
        .eq('newsletter_date', date)
        .eq('is_sent', false)
        .eq('sending_owner', runId)
        .select('newsletter_date')
      if (error) throw databaseError(error)
      if ((data?.length ?? 0) === 0) {
        throw new Error(`Newsletter lease ownership was lost before completion for ${date}.`)
      }
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

function sendDeadlineMinutes(env: SendEnvironment): number {
  const rawMinutes = env.SEND_DEADLINE_MINUTES
  if (rawMinutes === undefined || rawMinutes.trim() === '') {
    return DEFAULT_SEND_DEADLINE_MINUTES
  }
  const parsed = Number(rawMinutes)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SEND_DEADLINE_MINUTES
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
}): Promise<NewsletterContentRow | null> {
  const deadline = input.now() + input.waitMinutes * 60_000
  let poll = 0

  for (;;) {
    const content = await input.repository.fetchSendableContent(input.targetDate)
    if (contentIsReady(content)) return content
    if (!content) {
      const current = await input.repository.fetchContent(input.targetDate)
      if (current?.is_sent) return null
    }
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

async function confirmSentWithRetry(input: {
  readonly repository: SendNewsletterRepository
  readonly targetDate: string
  readonly runId: string
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
        input.runId,
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
  throw new Error(
    `발송 완료 DB 업데이트 실패 (이메일은 이미 발송됨): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

function koreanDateLabel(targetDate: string): string {
  return new Date(`${targetDate}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  })
}

class DeliveryWriteQueue {
  private readonly pending: Array<{
    readonly update: NewsletterDeliveryWrite
    readonly resolve: () => void
    readonly reject: (error: unknown) => void
  }> = []

  private timer: ReturnType<typeof setTimeout> | null = null
  private activeFlush: Promise<void> | null = null

  constructor(
    private readonly repository: SendNewsletterRepository,
    private readonly flushMs: number,
  ) {}

  enqueue(update: NewsletterDeliveryWrite): Promise<void> {
    const completion = new Promise<void>((resolvePromise, rejectPromise) => {
      this.pending.push({ update, resolve: resolvePromise, reject: rejectPromise })
    })
    if (this.pending.length >= DELIVERY_WRITE_BATCH_SIZE) {
      void this.flushBatch().catch(() => undefined)
    } else {
      this.schedule()
    }
    return completion
  }

  async flushAll(): Promise<void> {
    while (this.activeFlush || this.pending.length > 0) {
      if (this.activeFlush) await this.activeFlush
      else await this.flushBatch()
    }
  }

  private schedule(): void {
    if (this.timer !== null || this.activeFlush) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flushBatch().catch(() => undefined)
    }, this.flushMs)
  }

  private flushBatch(): Promise<void> {
    if (this.activeFlush) return this.activeFlush
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const entries = this.pending.splice(0, DELIVERY_WRITE_BATCH_SIZE)
    if (entries.length === 0) return Promise.resolve()

    const flush = this.repository.writeDeliveryUpdates(entries.map((entry) => entry.update))
      .then(() => entries.forEach((entry) => entry.resolve()))
      .catch((error: unknown) => {
        entries.forEach((entry) => entry.reject(error))
        throw error
      })
      .finally(() => {
        this.activeFlush = null
        if (this.pending.length > 0) this.schedule()
      })
    this.activeFlush = flush
    return flush
  }
}

function startLeaseRenewal(input: {
  readonly repository: SendNewsletterRepository
  readonly targetDate: string
  readonly runId: string
  readonly now: () => number
  readonly logger: SendLogger
  readonly intervalMs: number
}) {
  let lost = false
  let renewal: Promise<void> | null = null
  const timer = setInterval(() => {
    if (renewal || lost) return
    renewal = input.repository.renewLease(
      input.targetDate,
      input.runId,
      new Date(input.now() + LEASE_DURATION_MS).toISOString(),
    ).then((renewed) => {
      if (!renewed) {
        lost = true
        input.logger.error(JSON.stringify({
          event: 'send_lease_lost',
          targetDate: input.targetDate,
          runId: input.runId,
        }))
      }
    }).catch((error: unknown) => {
      lost = true
      input.logger.error('발송 리스 갱신 실패:', error)
    }).finally(() => {
      renewal = null
    })
  }, input.intervalMs)

  return {
    isHeld: () => !lost,
    async stop(): Promise<void> {
      clearInterval(timer)
      if (renewal) await renewal
    },
  }
}

function deliverySummary(input: {
  readonly targetDate: string
  readonly runId: string
  readonly counts: NewsletterDeliveryCounts
  readonly startedAt: number
  readonly now: () => number
}): string {
  return JSON.stringify({
    event: 'send_run_summary',
    targetDate: input.targetDate,
    runId: input.runId,
    accepted: input.counts.accepted,
    failedRetryable: input.counts.failedRetryable,
    failedTerminal: input.counts.failedTerminal,
    unknown: input.counts.unknown,
    pending: input.counts.pending,
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
  const runId = options.dispatchId || env.GITHUB_RUN_ID || randomUUID()
  const startedAt = now()
  const sendAlert = dependencies.sendAlert ?? sendNewsletterAlertEmail
  const alertSafely = async (
    alert: Parameters<typeof sendNewsletterAlertEmail>[0],
  ): Promise<boolean> => {
    try {
      return await sendAlert(alert)
    } catch (error) {
      logger.error('운영 알림 전송 실패:', error)
      return false
    }
  }
  assertIsoDate(targetDate)

  logger.log('🚀 뉴스레터 발송 작업 시작...')
  logger.log(`📅 target_date=${targetDate} run_id=${runId}`)

  let acquiredRepository: SendNewsletterRepository | null = null
  try {
    const repository = dependencies.repository ?? createSendNewsletterRepository(env)
    logger.log('📊 Supabase에서 구독자 가져오는 중...')
    const subscribers = await repository.fetchActiveSubscribers()

    if (subscribers.length === 0 && !options.dryRun) {
      logger.warn('⚠️ 활성 구독자가 없습니다.')
      logger.log(JSON.stringify({ event: 'send_skipped', reason: 'no_active_subscribers' }))
      await alertSafely({
        subject: `[${siteConfig.serviceName}] ${targetDate} 활성 구독자 0명 — 발송 생략`,
        lines: [
          `target_date: ${targetDate}`,
          `run_id: ${runId}`,
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
      const content = await waitForPreparedContent({
        repository,
        targetDate,
        dispatchId: runId,
        waitMinutes: waitForContentMinutes(env),
        sleep,
        now,
        logger,
      })
      if (!content) {
        logger.log(JSON.stringify({ event: 'send_skipped', reason: 'already_sent' }))
        return 0
      }
      newsletterContent = content
    }
    logger.log('✅ 뉴스레터 콘텐츠 로드 완료')

    if (options.dryRun) {
      const ledgerStatusCounts = await repository.countDeliveries(targetDate)
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
        ledgerStatusCounts,
      }))
      return 0
    }

    const claimNow = now()
    const acquired = await repository.acquireLease({
      date: targetDate,
      runId,
      nowIso: new Date(claimNow).toISOString(),
      leaseUntilIso: new Date(claimNow + LEASE_DURATION_MS).toISOString(),
      sendingStartedAt: newsletterContent.sending_started_at ?? new Date(claimNow).toISOString(),
    })
    if (!acquired) {
      logger.log(JSON.stringify({ event: 'send_skipped', reason: 'lease_held' }))
      return 0
    }
    acquiredRepository = repository
    logger.log(JSON.stringify({ event: 'send_lease_acquired', targetDate, runId }))

    const snapshot = await repository.snapshotDeliveries(
      targetDate,
      subscribers,
      new Date(now()).toISOString(),
    )
    logger.log(JSON.stringify({
      event: 'send_ledger_snapshot',
      targetDate,
      inserted: snapshot.inserted,
      existing: snapshot.existing,
    }))

    const subscribersById = new Map(
      subscribers.map((subscriber) => [String(subscriber.id), subscriber]),
    )
    const deliveryRows = await repository.fetchDeliveriesToSend(targetDate)
    const attemptsBySubscriberId = new Map(
      deliveryRows.map((delivery) => [delivery.subscriber_id, delivery.attempt_count]),
    )
    const recipients: EmailRecipient[] = deliveryRows.flatMap((delivery) => {
      const subscriber = subscribersById.get(delivery.subscriber_id)
      return subscriber
        ? [{
            subscriberId: delivery.subscriber_id,
            email: subscriber.email,
            ...(subscriber.name ? { name: subscriber.name } : {}),
          }]
        : []
    })
    const writeQueue = new DeliveryWriteQueue(
      repository,
      dependencies.deliveryWriteFlushMs ?? DELIVERY_WRITE_FLUSH_MS,
    )
    const lease = startLeaseRenewal({
      repository,
      targetDate,
      runId,
      now,
      logger,
      intervalMs: dependencies.leaseRenewIntervalMs ?? LEASE_RENEW_INTERVAL_MS,
    })

    try {
      await (dependencies.send ?? sendStockNewsletter)(
        recipients,
        {
          geminiAnalysis: newsletterContent.gemini_analysis ?? '',
          date: koreanDateLabel(targetDate),
        },
        {
          deadlineAt: now() + sendDeadlineMinutes(env) * 60_000,
          now,
          shouldContinue: lease.isHeld,
          beforeSend: async (recipient) => {
            const attemptCount = (attemptsBySubscriberId.get(recipient.subscriberId) ?? 0) + 1
            attemptsBySubscriberId.set(recipient.subscriberId, attemptCount)
            await writeQueue.enqueue({
              newsletter_date: targetDate,
              subscriber_id: recipient.subscriberId,
              email_domain: emailDomain(recipient.email),
              status: 'sending',
              attempt_count: attemptCount,
              last_error_code: null,
              provider_message_id: null,
              accepted_at: null,
              updated_at: new Date(now()).toISOString(),
            })
          },
          onResult: async (recipient, outcome: StockNewsletterDeliveryOutcome) => {
            await writeQueue.enqueue({
              newsletter_date: targetDate,
              subscriber_id: recipient.subscriberId,
              email_domain: emailDomain(recipient.email),
              status: outcome.status,
              attempt_count: attemptsBySubscriberId.get(recipient.subscriberId) ?? 1,
              last_error_code: outcome.errorCode ?? null,
              provider_message_id: outcome.messageId ?? null,
              accepted_at: outcome.status === 'accepted' ? new Date(now()).toISOString() : null,
              updated_at: new Date(now()).toISOString(),
            })
          },
        },
      )
      await writeQueue.flushAll()
    } catch (error) {
      await writeQueue.flushAll().catch((flushError: unknown) => {
        logger.error('발송 원장 flush 실패:', flushError)
      })
      await lease.stop()
      throw error
    }
    await lease.stop()

    const counts = await repository.countDeliveries(targetDate)
    logger.log(deliverySummary({ targetDate, runId, counts, startedAt, now }))
    const incomplete = counts.pending > 0
      || counts.failedRetryable > 0
      || counts.sending > 0
      || !lease.isHeld()
    if (incomplete) {
      await repository.releaseLease(targetDate, runId)
      acquiredRepository = null
      logger.error(JSON.stringify({
        event: 'send_incomplete',
        targetDate,
        runId,
        ...counts,
      }))
      await alertSafely({
        subject: `[${siteConfig.serviceName}] ${targetDate} 뉴스레터 발송 미완료`,
        lines: [
          `accepted: ${counts.accepted}`,
          `failed_retryable: ${counts.failedRetryable}`,
          `failed_terminal: ${counts.failedTerminal}`,
          `unknown: ${counts.unknown}`,
          `pending: ${counts.pending}`,
          `sending: ${counts.sending}`,
          `run_id: ${runId}`,
        ],
        env,
      })
      return 1
    }

    await confirmSentWithRetry({
      repository,
      targetDate,
      runId,
      sentAt: new Date(now()).toISOString(),
      subscriberCount: counts.accepted,
      sleep,
      logger,
    })
    acquiredRepository = null
    if (counts.unknown > 0 || counts.failedTerminal > 0) {
      await alertSafely({
        subject: `[${siteConfig.serviceName}] ${targetDate} 뉴스레터 발송 완료 — 수동 확인 필요`,
        lines: [
          `unknown: ${counts.unknown}`,
          `failed_terminal: ${counts.failedTerminal}`,
          `accepted: ${counts.accepted}`,
          `run_id: ${runId}`,
          'unknown은 중복 위험 때문에 자동 재발송하지 않습니다.',
        ],
        env,
      })
    }
    logger.log(JSON.stringify({
      event: 'send_completed',
      targetDate,
      runId,
      accepted: counts.accepted,
    }))
    return 0
  } catch (error) {
    if (acquiredRepository) {
      await acquiredRepository.releaseLease(targetDate, runId).catch((releaseError: unknown) => {
        logger.error('발송 작업 실패 후 리스 해제 실패:', releaseError)
      })
    }
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
