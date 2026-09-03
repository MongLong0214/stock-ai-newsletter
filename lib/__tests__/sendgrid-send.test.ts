import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  setApiKey: vi.fn(),
}))

vi.mock('@sendgrid/mail', () => ({
  default: {
    send: mocks.send,
    setApiKey: mocks.setApiKey,
  },
}))

import { sendStockNewsletter } from '@/lib/sendgrid'

function recipient(subscriberId: string, email: string) {
  return { subscriberId, email }
}

describe('sendStockNewsletter', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('reports per-recipient outcomes and provider message IDs without logging addresses', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    mocks.send
      .mockResolvedValueOnce([{ statusCode: 202, headers: { 'x-message-id': 'sg-first' } }])
      .mockRejectedValueOnce(new Error('rejected recipient: private-user@failed.example'))
      .mockResolvedValueOnce([{ statusCode: 202 }])
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const beforeSend = vi.fn(async () => undefined)
    const onResult = vi.fn(async () => undefined)

    const result = await sendStockNewsletter([
      recipient('subscriber-1', 'first@example.com'),
      recipient('subscriber-2', 'private-user@failed.example'),
      recipient('subscriber-3', 'third@example.org'),
    ], {
      date: '2026년 8월 28일',
      geminiAnalysis: '[]',
    }, { beforeSend, onResult })

    expect(mocks.send).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      sent: 2,
      failed: [{ index: 1, domain: 'failed.example' }],
      retried: 0,
      outcomes: [
        { subscriberId: 'subscriber-1', status: 'accepted', messageId: 'sg-first' },
        { subscriberId: 'subscriber-2', status: 'failed_terminal', errorCode: 'UNKNOWN' },
        { subscriberId: 'subscriber-3', status: 'accepted' },
      ],
    })
    expect(beforeSend).toHaveBeenCalledTimes(3)
    expect(onResult).toHaveBeenCalledTimes(3)
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
    expect(consoleLogSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
  })

  it('bounds in-flight sends with the configured worker count', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.stubEnv('SENDGRID_SEND_CONCURRENCY', '2')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const pending: Array<() => void> = []
    mocks.send.mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve([{ statusCode: 202 }]))
    }))

    const resultPromise = sendStockNewsletter(
      Array.from({ length: 4 }, (_, index) => (
        recipient(`subscriber-${index}`, `user-${index}@example.com`)
      )),
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
    pending.shift()?.()
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(3))
    pending.shift()?.()
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach((resolve) => resolve())

    await expect(resultPromise).resolves.toMatchObject({ sent: 4, failed: [], retried: 0 })
  })

  it('retries 429 and network failures with bounded backoff', async () => {
    vi.useFakeTimers()
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.send
      .mockRejectedValueOnce({ response: { statusCode: 429 } })
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValueOnce([{ statusCode: 202 }])

    const resultPromise = sendStockNewsletter(
      [recipient('subscriber-1', 'retry@example.com')],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.advanceTimersByTimeAsync(2_500)

    await expect(resultPromise).resolves.toMatchObject({ sent: 1, failed: [], retried: 2 })
    expect(mocks.send).toHaveBeenCalledTimes(3)
  })

  it('classifies non-429 4xx responses as terminal without retrying', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue({ response: { statusCode: 400 } })

    await expect(sendStockNewsletter(
      [recipient('subscriber-1', 'bad@example.com')],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )).resolves.toMatchObject({
      sent: 0,
      failed: [{ index: 0, domain: 'example.com' }],
      retried: 0,
      outcomes: [{
        subscriberId: 'subscriber-1',
        status: 'failed_terminal',
        errorCode: 'HTTP_400',
      }],
    })
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('classifies exhausted 5xx responses as retryable', async () => {
    vi.useFakeTimers()
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue({ response: { statusCode: 503 } })

    const resultPromise = sendStockNewsletter(
      [recipient('subscriber-1', 'retry@example.com')],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.advanceTimersByTimeAsync(8_500)

    await expect(resultPromise).resolves.toMatchObject({
      sent: 0,
      retried: 3,
      outcomes: [{
        subscriberId: 'subscriber-1',
        status: 'failed_retryable',
        errorCode: 'HTTP_503',
      }],
    })
  })

  it('marks a wrapper timeout unknown and never retries it automatically', async () => {
    vi.useFakeTimers()
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.stubEnv('SENDGRID_REQUEST_TIMEOUT_MS', '100')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockImplementation(() => new Promise(() => {}))

    const resultPromise = sendStockNewsletter(
      [recipient('subscriber-1', 'timeout@example.com')],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.advanceTimersByTimeAsync(100)

    await expect(resultPromise).resolves.toMatchObject({
      sent: 0,
      retried: 0,
      outcomes: [{
        subscriberId: 'subscriber-1',
        status: 'unknown',
        errorCode: 'ETIMEDOUT',
      }],
    })
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('stops starting recipients at the global deadline', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
    vi.stubEnv('SENDGRID_SEND_CONCURRENCY', '1')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockResolvedValue([{ statusCode: 202 }])
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(100)

    await expect(sendStockNewsletter(
      [
        recipient('subscriber-1', 'first@example.com'),
        recipient('subscriber-2', 'second@remaining.example'),
        recipient('subscriber-3', 'third@remaining.example'),
      ],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
      { deadlineAt: 100, now },
    )).resolves.toMatchObject({
      sent: 1,
      failed: [
        { index: 1, domain: 'remaining.example' },
        { index: 2, domain: 'remaining.example' },
      ],
      retried: 0,
      outcomes: [{ subscriberId: 'subscriber-1', status: 'accepted' }],
    })
    expect(mocks.send).toHaveBeenCalledOnce()
  })
})
