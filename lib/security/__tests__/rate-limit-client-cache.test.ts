import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, rpcMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

const originalEnv = process.env

beforeEach(() => {
  vi.resetModules()
  createClientMock.mockReset()
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({
    data: {
      limited: false,
      request_count: 1,
      window_start: 1_800_000_000,
      window_seconds: 60,
    },
    error: null,
  })
  createClientMock.mockReturnValue({ rpc: rpcMock })
  process.env = {
    ...originalEnv,
    RATE_LIMIT_HMAC_SECRET: 'h'.repeat(32),
    NEXT_PUBLIC_SUPABASE_URL: 'https://rate-limit-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key-v1',
  }
})

afterAll(() => {
  process.env = originalEnv
})

describe('rate-limit Supabase client lifecycle', () => {
  it('reuses a client while its URL and service key are unchanged', async () => {
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit')

    await checkRateLimit('203.0.113.10', RATE_LIMITS.subscribe)
    await checkRateLimit('203.0.113.11', RATE_LIMITS.subscribe)

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledTimes(2)
  })

  it('creates a fresh client after service-key rotation', async () => {
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit')

    await checkRateLimit('203.0.113.10', RATE_LIMITS.subscribe)
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-v2'
    await checkRateLimit('203.0.113.10', RATE_LIMITS.subscribe)

    expect(createClientMock).toHaveBeenCalledTimes(2)
  })
})
