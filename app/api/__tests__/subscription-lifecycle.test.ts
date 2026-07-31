/**
 * Regression tests for the double opt-in / opt-out lifecycle.
 *
 * Covers two defects found reviewing the original remediation batch:
 * - a returning subscriber could never re-confirm, because the pending row kept
 *   its previous confirmed_at and confirm_subscription then reported
 *   'already_confirmed' while the subscriber stayed inactive.
 * - a subscriber holding a legacy or expired link had no way to opt out at all.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, upsertMock, sendConfirmationMock, sendUnsubscribeLinkMock, maybeSingleMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    upsertMock: vi.fn(),
    sendConfirmationMock: vi.fn(),
    sendUnsubscribeLinkMock: vi.fn(),
    maybeSingleMock: vi.fn(),
  }))

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))
vi.mock('@/lib/sendgrid', () => ({
  sendSubscriptionConfirmation: sendConfirmationMock,
  sendUnsubscribeLink: sendUnsubscribeLinkMock,
}))
vi.mock('@/lib/security/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/rate-limit')>()
  return {
    ...actual,
    checkRateLimit: vi.fn().mockResolvedValue({ status: 'allowed', remaining: 5, resetAt: 0 }),
    getTrustedClientIp: vi.fn().mockReturnValue('203.0.113.5'),
  }
})

const originalEnv = process.env

function jsonRequest(body: unknown): Request {
  return new Request('https://stockmatrix.co.kr/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.5' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetModules()
  upsertMock.mockReset().mockResolvedValue({ error: null })
  sendConfirmationMock.mockReset().mockResolvedValue(undefined)
  sendUnsubscribeLinkMock.mockReset().mockResolvedValue(undefined)
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null })

  createClientMock.mockReset().mockReturnValue({
    from: vi.fn().mockReturnValue({
      upsert: upsertMock,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  })

  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://lifecycle-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
    UNSUBSCRIBE_TOKEN_SECRET: 'u'.repeat(32),
    RATE_LIMIT_HMAC_SECRET: 'h'.repeat(32),
  }
})

afterAll(() => {
  process.env = originalEnv
})

describe('POST /api/subscribe', () => {
  it('clears confirmed_at so a returning subscriber can confirm again', async () => {
    const { POST } = await import('@/app/api/subscribe/route')

    const response = await POST(jsonRequest({ email: 'returning@example.com' }) as never)

    expect(response.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledTimes(1)

    const [payload, options] = upsertMock.mock.calls[0]
    expect(payload).toMatchObject({ email: 'returning@example.com', confirmed_at: null })
    expect(options).toEqual({ onConflict: 'email' })
  })
})

describe('POST /api/unsubscribe/request', () => {
  it('mails a fresh link when the address is an active subscriber', async () => {
    maybeSingleMock.mockResolvedValue({ data: { email: 'active@example.com' }, error: null })
    const { POST } = await import('@/app/api/unsubscribe/request/route')

    const response = await POST(jsonRequest({ email: 'active@example.com' }) as never)

    expect(response.status).toBe(200)
    expect(sendUnsubscribeLinkMock).toHaveBeenCalledTimes(1)
    const [recipient, token] = sendUnsubscribeLinkMock.mock.calls[0]
    expect(recipient).toBe('active@example.com')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('does not mail unknown addresses but returns an identical response', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/unsubscribe/request/route')

    const response = await POST(jsonRequest({ email: 'stranger@example.com' }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(sendUnsubscribeLinkMock).not.toHaveBeenCalled()
    expect(body).toEqual({
      status: 'requested',
      message: '해당 주소가 구독 중이라면 구독 취소 링크를 발송했습니다. 이메일을 확인해주세요.',
    })
  })

  it('issues a token the unsubscribe endpoint accepts', async () => {
    maybeSingleMock.mockResolvedValue({ data: { email: 'active@example.com' }, error: null })
    const { POST } = await import('@/app/api/unsubscribe/request/route')
    await POST(jsonRequest({ email: 'active@example.com' }) as never)

    const [, token] = sendUnsubscribeLinkMock.mock.calls[0]
    const { validateUnsubscribeToken } = await import('@/lib/security/timing-safe-auth')

    expect(validateUnsubscribeToken(token)).toEqual({ valid: true, email: 'active@example.com' })
  })
})
