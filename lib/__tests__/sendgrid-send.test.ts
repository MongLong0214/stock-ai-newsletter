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
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('settles every recipient and reports failed indices/domains without email addresses', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-api-key')
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@stockmatrix.co.kr')
    vi.stubEnv('SENDGRID_FROM_NAME', 'StockMatrix')
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
    })
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
    expect(consoleLogSpy.mock.calls.flat().join(' ')).not.toContain('private-user@failed.example')
  })
})
