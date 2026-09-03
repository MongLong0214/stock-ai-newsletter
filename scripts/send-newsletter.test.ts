import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { countNewsletterDeliveryStatuses } from '@/lib/newsletter/delivery'
import {
  sendStockNewsletter,
  type StockNewsletterDeliveryOutcome,
  type StockNewsletterDeliveryStatus,
} from '@/lib/sendgrid'
import {
  fetchActiveSubscribers,
  parseSendNewsletterCliArgs,
  runSendNewsletter,
  type NewsletterContentRow,
  type NewsletterDeliveryRow,
  type SendNewsletterRepository,
  type SubscriberRow,
} from './send-newsletter'

const TARGET_DATE = '2026-09-02'
const READY_CONTENT: NewsletterContentRow = {
  newsletter_date: TARGET_DATE,
  gemini_analysis: '[]',
  picks_source: 'code',
  is_sent: false,
  sent_at: null,
  sending_owner: null,
  sending_lease_until: null,
  sending_started_at: null,
}
const SUBSCRIBERS: SubscriberRow[] = [
  {
    id: 'subscriber-1',
    email: 'first@example.com',
    name: 'First',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'subscriber-2',
    email: 'second@example.org',
    name: null,
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'subscriber-3',
    email: 'third@example.net',
    name: 'Third',
    created_at: '2026-01-03T00:00:00.000Z',
  },
]

function delivery(
  subscriberId: string,
  status: NewsletterDeliveryRow['status'],
  attemptCount = 0,
): NewsletterDeliveryRow {
  return {
    newsletter_date: TARGET_DATE,
    subscriber_id: subscriberId,
    email_domain: 'example.com',
    status,
    attempt_count: attemptCount,
    last_error_code: null,
    provider_message_id: null,
    accepted_at: status === 'accepted' ? '2026-09-02T00:00:00.000Z' : null,
    updated_at: '2026-09-02T00:00:00.000Z',
  }
}

function makeLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function makeRepository(input: {
  readonly subscribers?: readonly SubscriberRow[]
  readonly deliveries?: readonly NewsletterDeliveryRow[]
  readonly acquireLease?: boolean
  readonly content?: NewsletterContentRow
  readonly overrides?: Partial<SendNewsletterRepository>
} = {}) {
  const subscribers = [...(input.subscribers ?? [SUBSCRIBERS[0]])]
  const rows = new Map(
    (input.deliveries ?? []).map((row) => [row.subscriber_id, { ...row }]),
  )
  const content = input.content ?? READY_CONTENT
  const repository: SendNewsletterRepository = {
    fetchActiveSubscribers: vi.fn(async () => subscribers),
    fetchContent: vi.fn(async () => content),
    fetchSendableContent: vi.fn(async () => content.is_sent ? null : content),
    acquireLease: vi.fn(async () => input.acquireLease ?? true),
    renewLease: vi.fn(async () => true),
    releaseLease: vi.fn(async () => undefined),
    markStaleSendingAsUnknown: vi.fn(async (_date, updatedAt) => {
      let marked = 0
      rows.forEach((row, subscriberId) => {
        if (row.status !== 'sending') return
        rows.set(subscriberId, { ...row, status: 'unknown', updated_at: updatedAt })
        marked += 1
      })
      return marked
    }),
    snapshotDeliveries: vi.fn(async (date, activeSubscribers, updatedAt) => {
      let inserted = 0
      let existing = 0
      for (const subscriber of activeSubscribers) {
        const subscriberId = String(subscriber.id)
        if (rows.has(subscriberId)) {
          existing += 1
          continue
        }
        inserted += 1
        rows.set(subscriberId, {
          ...delivery(subscriberId, 'pending'),
          newsletter_date: date,
          email_domain: subscriber.email.split('@')[1] ?? 'unknown',
          updated_at: updatedAt,
        })
      }
      return { inserted, existing }
    }),
    fetchDeliveriesToSend: vi.fn(async () => [...rows.values()].filter((row) => (
      row.status === 'pending' || row.status === 'failed_retryable'
    ))),
    countDeliveries: vi.fn(async () => countNewsletterDeliveryStatuses([...rows.values()])),
    writeDeliveryUpdates: vi.fn(async (updates) => {
      updates.forEach((update) => rows.set(update.subscriber_id, { ...update }))
    }),
    confirmSent: vi.fn(async () => undefined),
    ...input.overrides,
  }
  return { repository, rows }
}

function makeSend(
  statuses: Readonly<Record<string, StockNewsletterDeliveryStatus>> = {},
): typeof sendStockNewsletter {
  return vi.fn(async (recipients, _data, options) => {
    const outcomes: StockNewsletterDeliveryOutcome[] = []
    for (const recipient of recipients) {
      if (options.shouldContinue?.() === false) break
      await options.beforeSend?.(recipient)
      const status = statuses[recipient.subscriberId] ?? 'accepted'
      const outcome: StockNewsletterDeliveryOutcome = {
        subscriberId: recipient.subscriberId,
        status,
        ...(status === 'accepted' ? { messageId: `sg-${recipient.subscriberId}` } : {}),
        ...(status === 'failed_retryable' ? { errorCode: 'HTTP_503' } : {}),
        ...(status === 'failed_terminal' ? { errorCode: 'HTTP_400' } : {}),
        ...(status === 'unknown' ? { errorCode: 'ETIMEDOUT' } : {}),
      }
      outcomes.push(outcome)
      await options.onResult?.(recipient, outcome)
    }
    return {
      sent: outcomes.filter((outcome) => outcome.status === 'accepted').length,
      failed: [],
      retried: 0,
      outcomes,
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('newsletter delivery migration', () => {
  it('keeps the newsletter delivery ledger migration additive', async () => {
    const migration = await readFile(
      'supabase/migrations/063_newsletter_delivery_ledger.sql',
      'utf8',
    )

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS sending_owner TEXT')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.newsletter_deliveries')
    expect(migration).toContain('PRIMARY KEY (newsletter_date, subscriber_id)')
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i)
  })
})

describe('send newsletter CLI', () => {
  it('parses target date and dispatch correlation ID', () => {
    expect(parseSendNewsletterCliArgs([
      '--target-date=2026-09-02',
      '--dispatch-id=dispatch-fixture',
      '--dry-run',
    ])).toEqual({
      targetDate: '2026-09-02',
      dispatchId: 'dispatch-fixture',
      dryRun: true,
    })
  })
})

describe('runSendNewsletter', () => {
  it('renders dry-run and prints ledger counts without writes', async () => {
    const { repository } = makeRepository({
      deliveries: [delivery('subscriber-1', 'accepted')],
    })
    const send = makeSend()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'dispatch-fixture', dryRun: true },
      { env: {}, repository, send, logger },
    )).resolves.toBe(0)

    expect(repository.fetchContent).toHaveBeenCalledWith(TARGET_DATE)
    expect(repository.acquireLease).not.toHaveBeenCalled()
    expect(repository.snapshotDeliveries).not.toHaveBeenCalled()
    expect(repository.writeDeliveryUpdates).not.toHaveBeenCalled()
    expect(repository.confirmSent).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    const dryRunEvent = logger.log.mock.calls.flat().map(String)
      .find((line) => line.includes('send_dry_run'))
    expect(JSON.parse(dryRunEvent ?? '{}')).toMatchObject({
      ledgerStatusCounts: { accepted: 1, pending: 0, failedRetryable: 0 },
    })
  })

  it('polls missing and incomplete content every 30 seconds until ready', async () => {
    const fetchSendableContent = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...READY_CONTENT, gemini_analysis: ' ', picks_source: null })
      .mockResolvedValueOnce(READY_CONTENT)
    const { repository } = makeRepository({
      overrides: {
        fetchSendableContent,
        fetchContent: vi.fn(async () => null),
      },
    })
    const send = makeSend()
    const sleep = vi.fn(async () => undefined)

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'polling-fixture' },
      {
        env: { SEND_WAIT_FOR_CONTENT_MINUTES: '2' },
        repository,
        send,
        sleep,
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(0)
    expect(fetchSendableContent).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledOnce()
  })

  it('acquires the lease and snapshots new recipients while preserving accepted rows', async () => {
    const nowMs = Date.parse('2026-09-02T22:27:00.000Z')
    const { repository, rows } = makeRepository({
      subscribers: SUBSCRIBERS.slice(0, 2),
      deliveries: [delivery('subscriber-1', 'accepted', 1)],
    })
    const send = makeSend()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'lease-owner' },
      { env: {}, repository, send, logger, deliveryWriteFlushMs: 0, now: () => nowMs },
    )).resolves.toBe(0)

    expect(repository.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
      date: TARGET_DATE,
      runId: 'lease-owner',
      nowIso: new Date(nowMs).toISOString(),
      leaseUntilIso: new Date(nowMs + 12 * 60_000).toISOString(),
    }))
    expect(send).toHaveBeenCalledWith(
      [{ subscriberId: 'subscriber-2', email: 'second@example.org' }],
      expect.any(Object),
      expect.any(Object),
    )
    expect(rows.get('subscriber-1')?.status).toBe('accepted')
    expect(rows.get('subscriber-2')?.status).toBe('accepted')
    expect(repository.confirmSent).toHaveBeenCalledWith(
      TARGET_DATE,
      'lease-owner',
      expect.any(String),
      2,
    )
    expect(logger.log.mock.calls.flat().map(String)).toContain(JSON.stringify({
      event: 'send_ledger_snapshot',
      targetDate: TARGET_DATE,
      inserted: 1,
      existing: 1,
    }))
  })

  it('marks inactive subscribers terminal so pending rows cannot block completion', async () => {
    const { repository, rows } = makeRepository({
      subscribers: [SUBSCRIBERS[0]],
      deliveries: [
        delivery('subscriber-1', 'pending'),
        delivery('subscriber-2', 'pending'),
      ],
    })
    const send = makeSend()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'inactive-run' },
      { env: {}, repository, send, logger, deliveryWriteFlushMs: 0 },
    )).resolves.toBe(0)

    expect(rows.get('subscriber-2')).toMatchObject({
      status: 'failed_terminal',
      last_error_code: 'INACTIVE_SUBSCRIBER',
    })
    expect(send).toHaveBeenCalledWith(
      [{ subscriberId: 'subscriber-1', email: 'first@example.com', name: 'First' }],
      expect.any(Object),
      expect.any(Object),
    )
    expect(repository.confirmSent).toHaveBeenCalledWith(
      TARGET_DATE,
      'inactive-run',
      expect.any(String),
      1,
    )
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_inactive_subscribers_terminal',
      count: 1,
    }))
  })

  it('skips successfully when another worker holds the lease', async () => {
    const { repository } = makeRepository({ acquireLease: false })
    const send = makeSend()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'contender' },
      { env: {}, repository, send, logger },
    )).resolves.toBe(0)

    expect(repository.snapshotDeliveries).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_skipped',
      reason: 'lease_held',
    }))
  })

  it('resends only retryable ledger rows and never resends accepted or unknown rows', async () => {
    const { repository } = makeRepository({
      subscribers: SUBSCRIBERS,
    })
    const firstSend = makeSend({
      'subscriber-1': 'accepted',
      'subscriber-2': 'failed_retryable',
      'subscriber-3': 'unknown',
    })
    const retrySend = makeSend()
    const sendAlert = vi.fn(async () => true)

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'primary-slot' },
      {
        env: {},
        repository,
        send: firstSend,
        sendAlert,
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(1)
    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'retry-slot' },
      {
        env: {},
        repository,
        send: retrySend,
        sendAlert,
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(0)

    expect(firstSend).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ subscriberId: 'subscriber-1' }),
        expect.objectContaining({ subscriberId: 'subscriber-2' }),
        expect.objectContaining({ subscriberId: 'subscriber-3' }),
      ]),
      expect.any(Object),
      expect.any(Object),
    )
    expect(retrySend).toHaveBeenCalledWith(
      [{ subscriberId: 'subscriber-2', email: 'second@example.org' }],
      expect.any(Object),
      expect.any(Object),
    )
    expect(repository.confirmSent).toHaveBeenCalledWith(
      TARGET_DATE,
      'retry-slot',
      expect.any(String),
      2,
    )
  })

  it('marks a previous worker sending row unknown and completes without resending it', async () => {
    const { repository, rows } = makeRepository({
      deliveries: [delivery('subscriber-1', 'sending', 1)],
    })
    const send = makeSend()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'recovery-slot' },
      { env: {}, repository, send, logger, deliveryWriteFlushMs: 0 },
    )).resolves.toBe(0)

    expect(repository.markStaleSendingAsUnknown).toHaveBeenCalledWith(
      TARGET_DATE,
      expect.any(String),
    )
    expect(rows.get('subscriber-1')?.status).toBe('unknown')
    expect(send).toHaveBeenCalledWith([], expect.any(Object), expect.any(Object))
    expect(repository.confirmSent).toHaveBeenCalledWith(
      TARGET_DATE,
      'recovery-slot',
      expect.any(String),
      0,
    )
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_stale_sending_marked_unknown',
      count: 1,
    }))
  })

  it('releases the lease and exits 1 while retryable deliveries remain', async () => {
    const { repository } = makeRepository()
    const sendAlert = vi.fn(async () => true)
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'incomplete-run' },
      {
        env: {},
        repository,
        send: makeSend({ 'subscriber-1': 'failed_retryable' }),
        sendAlert,
        logger,
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(1)

    expect(repository.releaseLease).toHaveBeenCalledWith(TARGET_DATE, 'incomplete-run')
    expect(repository.confirmSent).not.toHaveBeenCalled()
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('발송 미완료'),
      lines: expect.arrayContaining(['failed_retryable: 1']),
    }))
    expect(logger.error.mock.calls.flat().join(' ')).toContain('send_incomplete')
  })

  it('treats unknown as terminal for completion and alerts for manual review', async () => {
    const { repository } = makeRepository()
    const sendAlert = vi.fn(async () => true)

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'unknown-run' },
      {
        env: {},
        repository,
        send: makeSend({ 'subscriber-1': 'unknown' }),
        sendAlert,
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(0)

    expect(repository.confirmSent).toHaveBeenCalledWith(
      TARGET_DATE,
      'unknown-run',
      expect.any(String),
      0,
    )
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('수동 확인 필요'),
      lines: expect.arrayContaining(['unknown: 1']),
    }))
  })

  it('stops starting recipients and exits 1 when lease renewal loses ownership', async () => {
    const { repository } = makeRepository({
      subscribers: SUBSCRIBERS.slice(0, 2),
      overrides: { renewLease: vi.fn(async () => false) },
    })
    const send: typeof sendStockNewsletter = vi.fn(async (recipients, _data, options) => {
      const first = recipients[0]
      if (first) await options.beforeSend?.(first)
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
      return { sent: 0, failed: [], retried: 0, outcomes: [] }
    })

    const resultPromise = runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'lost-lease' },
      {
        env: {},
        repository,
        send,
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
        leaseRenewIntervalMs: 1,
      },
    )

    await expect(resultPromise).resolves.toBe(1)
    expect(repository.renewLease).toHaveBeenCalledOnce()
    expect(repository.confirmSent).not.toHaveBeenCalled()
    expect(repository.releaseLease).toHaveBeenCalledWith(TARGET_DATE, 'lost-lease')
  })

  it('retries completion three times after the initial failure', async () => {
    const confirmSent = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'))
      .mockResolvedValueOnce(undefined)
    const { repository } = makeRepository({ overrides: { confirmSent } })

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'confirm-retry' },
      {
        env: {},
        repository,
        send: makeSend(),
        sleep: vi.fn(async () => undefined),
        logger: makeLogger(),
        deliveryWriteFlushMs: 0,
      },
    )).resolves.toBe(0)
    expect(confirmSent).toHaveBeenCalledTimes(4)
  })
})

describe('subscriber pagination', () => {
  it('requests deterministic 1,000-row pages ordered by created_at and id', async () => {
    const ranges: Array<[number, number]> = []
    const orders: string[] = []
    const firstPage = Array.from({ length: 1_000 }, (_, index): SubscriberRow => ({
      ...SUBSCRIBERS[0],
      id: `subscriber-${index}`,
      email: `reader-${index}@example.com`,
    }))
    const finalPage: SubscriberRow[] = [{
      ...SUBSCRIBERS[0],
      id: 'subscriber-1000',
      email: 'reader-1000@example.com',
    }]
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn((column: string) => {
        orders.push(column)
        return query
      }),
      range: vi.fn(async (from: number, to: number) => {
        ranges.push([from, to])
        return { data: from === 0 ? firstPage : finalPage, error: null }
      }),
    }
    const client = {
      from: vi.fn(() => query),
    } as unknown as Parameters<typeof fetchActiveSubscribers>[0]

    const subscribers = await fetchActiveSubscribers(client)

    expect(subscribers).toHaveLength(1_001)
    expect(orders).toEqual(['created_at', 'id', 'created_at', 'id'])
    expect(ranges).toEqual([[0, 999], [1_000, 1_999]])
  })
})
