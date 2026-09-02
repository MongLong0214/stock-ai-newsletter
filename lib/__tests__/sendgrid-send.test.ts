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

describe('sendStockNewsletter', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('settles every recipient and reports failed indices/domains without email addresses', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'Stock Matrix')
    mocks.send
      .mockResolvedValueOnce([{ statusCode: 202 }])
      .mockRejectedValueOnce(new Error('rejected recipient: private-user@failed.example'))
      .mockResolvedValueOnce([{ statusCode: 202 }])
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendStockNewsletter([
      { email: 'first@example.com' },
      { email: 'private-user@failed.example' },
      { email: 'third@example.org' },
    ], {
      date: '2026년 8월 28일',
      geminiAnalysis: '[]',
    })

    expect(mocks.send).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      sent: 2,
      failed: [{ index: 1, domain: 'failed.example' }],
      retried: 0,
    })
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
    expect(consoleLogSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
  })

  it('bounds in-flight sends with the configured worker count', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'Stock Matrix')
    vi.stubEnv('SENDGRID_SEND_CONCURRENCY', '2')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const pending: Array<() => void> = []
    mocks.send.mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve([{ statusCode: 202 }]))
    }))

    const resultPromise = sendStockNewsletter(
      Array.from({ length: 4 }, (_, index) => ({ email: `user-${index}@example.com` })),
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2))
    pending.shift()?.()
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(3))
    pending.shift()?.()
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach((resolve) => resolve())

    await expect(resultPromise).resolves.toEqual({ sent: 4, failed: [], retried: 0 })
  })

  it('retries 429 and network failures with bounded backoff', async () => {
    vi.useFakeTimers()
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'Stock Matrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.send
      .mockRejectedValueOnce({ response: { statusCode: 429 } })
      .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
      .mockResolvedValueOnce([{ statusCode: 202 }])

    const resultPromise = sendStockNewsletter(
      [{ email: 'retry@example.com' }],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.advanceTimersByTimeAsync(2_500)

    await expect(resultPromise).resolves.toEqual({ sent: 1, failed: [], retried: 2 })
    expect(mocks.send).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('fails non-429 4xx responses immediately without retrying', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'Stock Matrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.send.mockRejectedValue({ response: { statusCode: 400 } })

    await expect(sendStockNewsletter(
      [{ email: 'bad@example.com' }],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )).resolves.toEqual({
      sent: 0,
      failed: [{ index: 0, domain: 'example.com' }],
      retried: 0,
    })
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('classifies 5xx responses as transient', async () => {
    vi.useFakeTimers()
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'Stock Matrix')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.send
      .mockRejectedValueOnce({ response: { statusCode: 503 } })
      .mockResolvedValueOnce([{ statusCode: 202 }])

    const resultPromise = sendStockNewsletter(
      [{ email: 'retry@example.com' }],
      { date: '2026년 9월 2일', geminiAnalysis: '[]' },
    )
    await vi.advanceTimersByTimeAsync(500)

    await expect(resultPromise).resolves.toEqual({ sent: 1, failed: [], retried: 1 })
  })
})
