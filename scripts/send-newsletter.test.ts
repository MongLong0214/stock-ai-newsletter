import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchActiveSubscribers,
  parseSendNewsletterCliArgs,
  runSendNewsletter,
  type NewsletterContentRow,
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
}
const SUBSCRIBER: SubscriberRow = {
  id: 'subscriber-1',
  email: 'reader@example.com',
  name: 'Reader',
  created_at: '2026-01-01T00:00:00.000Z',
}

function makeLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function makeRepository(overrides: Partial<SendNewsletterRepository> = {}): SendNewsletterRepository {
  return {
    fetchActiveSubscribers: vi.fn(async () => [SUBSCRIBER]),
    fetchContent: vi.fn(async () => ({ ...READY_CONTENT, is_sent: true })),
    fetchSendableContent: vi.fn(async () => READY_CONTENT),
    claim: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    confirmSent: vi.fn(async () => undefined),
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
  it('renders the first recipient in dry-run without SendGrid or database writes', async () => {
    const repository = makeRepository()
    const send = vi.fn()
    const sendAlert = vi.fn()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'dispatch-fixture', dryRun: true },
      { env: {}, repository, send, sendAlert, logger },
    )).resolves.toBe(0)

    expect(repository.fetchActiveSubscribers).toHaveBeenCalledOnce()
    expect(repository.fetchContent).toHaveBeenCalledWith(TARGET_DATE)
    expect(repository.fetchSendableContent).not.toHaveBeenCalled()
    expect(repository.claim).not.toHaveBeenCalled()
    expect(repository.rollback).not.toHaveBeenCalled()
    expect(repository.confirmSent).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(sendAlert).not.toHaveBeenCalled()
    const event = logger.log.mock.calls
      .map(([value]) => String(value))
      .map((value) => {
        try { return JSON.parse(value) as Record<string, unknown> } catch { return null }
      })
      .find((value) => value?.event === 'send_dry_run')
    expect(event).toMatchObject({
      event: 'send_dry_run',
      targetDate: TARGET_DATE,
      subscribers: 1,
      isSent: true,
      picksSource: 'code',
      isCrash: false,
    })
    expect(event?.htmlBytes).toEqual(expect.any(Number))
    expect(event?.htmlBytes).toBeGreaterThan(0)
  })

  it('polls missing and incomplete content every 30 seconds until it is ready', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-02T00:00:00.000Z')
    const fetchSendableContent = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        newsletter_date: TARGET_DATE,
        gemini_analysis: '   ',
        picks_source: null,
        is_sent: false,
        sent_at: null,
      })
      .mockResolvedValueOnce(READY_CONTENT)
    const repository = makeRepository({ fetchSendableContent })
    const logger = makeLogger()
    const send = vi.fn(async () => ({ sent: 1, failed: [], retried: 0 }))

    const resultPromise = runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'dispatch-fixture' },
      {
        env: { SEND_WAIT_FOR_CONTENT_MINUTES: '2' },
        repository,
        send,
        logger,
      },
    )
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(resultPromise).resolves.toBe(0)
    expect(fetchSendableContent).toHaveBeenCalledTimes(3)
    expect(repository.fetchContent).toHaveBeenCalledOnce()
    const heartbeatLines = logger.log.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes('send_waiting_for_content'))
    expect(heartbeatLines).toHaveLength(2)
    expect(send).toHaveBeenCalledOnce()
  })

  it('alerts and exits successfully when no active subscribers exist', async () => {
    const repository = makeRepository({
      fetchActiveSubscribers: vi.fn(async () => []),
    })
    const sendAlert = vi.fn(async () => true)
    const send = vi.fn()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'dispatch-fixture' },
      { env: {}, repository, sendAlert, send, logger },
    )).resolves.toBe(0)

    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('활성 구독자 0명'),
    }))
    expect(send).not.toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_skipped',
      reason: 'no_active_subscribers',
    }))
  })

  it('retries sent_at confirmation three times after the initial failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-02T00:00:00.000Z')
    const confirmSent = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValueOnce(new Error('third'))
      .mockResolvedValueOnce(undefined)
    const repository = makeRepository({ confirmSent })
    const logger = makeLogger()

    const resultPromise = runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'dispatch-fixture' },
      {
        env: {},
        repository,
        send: vi.fn(async () => ({ sent: 1, failed: [], retried: 0 })),
        logger,
      },
    )
    await vi.advanceTimersByTimeAsync(8_500)

    await expect(resultPromise).resolves.toBe(0)
    expect(confirmSent).toHaveBeenCalledTimes(4)
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.log.mock.calls.flat().join(' ')).toContain('send_run_summary')
  })

  it('recovers an unconfirmed claim by sending to all subscribers without claiming again', async () => {
    const repository = makeRepository({
      fetchSendableContent: vi.fn(async () => ({
        ...READY_CONTENT,
        is_sent: true,
        sent_at: null,
      })),
    })
    const send = vi.fn(async () => ({ sent: 1, failed: [], retried: 0 }))
    const sendAlert = vi.fn(async () => true)
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'recovery-dispatch' },
      { env: {}, repository, send, sendAlert, logger },
    )).resolves.toBe(0)

    expect(repository.claim).not.toHaveBeenCalled()
    expect(repository.rollback).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      [{ email: SUBSCRIBER.email, name: SUBSCRIBER.name }],
      expect.any(Object),
      expect.objectContaining({ deadlineAt: expect.any(Number) }),
    )
    expect(repository.confirmSent).toHaveBeenCalledOnce()
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: `[Stock Matrix] ${TARGET_DATE} 발송 선점 미확정 복구 — 재발송 (중복 가능)`,
    }))
    expect(logger.warn).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_recovering_unconfirmed_claim',
      targetDate: TARGET_DATE,
    }))
  })

  it('skips immediately when sent_at is already set', async () => {
    const repository = makeRepository({
      fetchSendableContent: vi.fn(async () => null),
      fetchContent: vi.fn(async () => ({
        ...READY_CONTENT,
        is_sent: true,
        sent_at: '2026-09-02T00:00:00.000Z',
      })),
    })
    const send = vi.fn()
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'duplicate-dispatch' },
      { env: {}, repository, send, logger },
    )).resolves.toBe(0)

    expect(repository.claim).not.toHaveBeenCalled()
    expect(repository.rollback).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(logger.log).toHaveBeenCalledWith(JSON.stringify({
      event: 'send_skipped',
      reason: 'already_sent',
    }))
  })

  it('returns exit code 1 after final confirmation failure without rolling back sent emails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-09-02T00:00:00.000Z')
    const repository = makeRepository({
      confirmSent: vi.fn(async () => { throw new Error('database unavailable') }),
    })
    const logger = makeLogger()

    const resultPromise = runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'confirm-failure' },
      {
        env: {},
        repository,
        send: vi.fn(async () => ({ sent: 1, failed: [], retried: 0 })),
        logger,
      },
    )
    await vi.advanceTimersByTimeAsync(8_500)

    await expect(resultPromise).resolves.toBe(1)
    expect(repository.confirmSent).toHaveBeenCalledTimes(4)
    expect(repository.rollback).not.toHaveBeenCalled()
    expect(logger.error.mock.calls.flat().join(' ')).toContain('이메일은 이미 발송됨')
  })

  it('confirms partial delivery, alerts failed domains, and records failed_count', async () => {
    const repository = makeRepository()
    const sendAlert = vi.fn(async () => true)
    const logger = makeLogger()

    await expect(runSendNewsletter(
      { targetDate: TARGET_DATE, dispatchId: 'partial-failure' },
      {
        env: {},
        repository,
        sendAlert,
        send: vi.fn(async () => ({
          sent: 1,
          failed: [{ index: 1, domain: 'failed.example' }],
          retried: 3,
        })),
        logger,
      },
    )).resolves.toBe(1)

    expect(repository.confirmSent).toHaveBeenCalledWith(TARGET_DATE, expect.any(String), 1)
    expect(repository.rollback).not.toHaveBeenCalled()
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('부분 발송 실패 1명'),
      lines: expect.arrayContaining(['failed_count: 1', 'failed_domains: failed.example']),
    }))
    const summary = logger.log.mock.calls.flat().map(String)
      .find((line) => line.includes('send_run_summary'))
    expect(JSON.parse(summary ?? '{}')).toMatchObject({ failed_count: 1 })
  })
})

describe('subscriber pagination', () => {
  it('requests deterministic 1,000-row pages ordered by created_at and id', async () => {
    const ranges: Array<[number, number]> = []
    const orders: string[] = []
    const firstPage = Array.from({ length: 1_000 }, (_, index): SubscriberRow => ({
      ...SUBSCRIBER,
      id: `subscriber-${index}`,
      email: `reader-${index}@example.com`,
    }))
    const finalPage: SubscriberRow[] = [{
      ...SUBSCRIBER,
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
