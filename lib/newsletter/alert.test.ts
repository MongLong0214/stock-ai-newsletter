import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { sendNewsletterAlertEmail } from '@/lib/newsletter/alert'

describe('sendNewsletterAlertEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.send.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is a quiet network no-op when SendGrid configuration is missing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(sendNewsletterAlertEmail({
      subject: 'fixture alert',
      lines: ['line one'],
      env: {},
    })).resolves.toBe(false)

    expect(mocks.setApiKey).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('SENDGRID 환경변수 없음 — 알림 메일을 시도하지 않습니다.')
  })

  it('sends the requested subject and joined lines when configured', async () => {
    await expect(sendNewsletterAlertEmail({
      subject: 'fixture alert',
      lines: ['line one', 'line two'],
      env: {
        SENDGRID_API_KEY: 'test-api-key',
        SENDGRID_FROM_EMAIL: 'from@example.com',
        NEWSLETTER_ALERT_EMAIL: 'to@example.com',
      },
    })).resolves.toBe(true)

    expect(mocks.setApiKey).toHaveBeenCalledWith('test-api-key')
    expect(mocks.send).toHaveBeenCalledWith({
      to: 'to@example.com',
      from: 'from@example.com',
      subject: 'fixture alert',
      text: 'line one\nline two',
    })
  })

  it('logs delivery failures without throwing', async () => {
    mocks.send.mockRejectedValue(new Error('synthetic SendGrid failure'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendNewsletterAlertEmail({
      subject: 'fixture alert',
      lines: ['line one'],
      env: {
        SENDGRID_API_KEY: 'test-api-key',
        SENDGRID_FROM_EMAIL: 'from@example.com',
      },
    })).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('알림 메일 전송 실패: synthetic SendGrid failure')
  })
})
