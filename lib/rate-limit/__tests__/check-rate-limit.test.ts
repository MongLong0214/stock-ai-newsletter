import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

// Module-level mocks. The implementation is expected to import these and
// instantiate lazily so that tests can replace process.env before import.
const mockLimit = vi.fn();

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    limit = mockLimit;
    static slidingWindow = vi.fn(() => ({ __algo: 'sliding' }));
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({ __redis: true })),
  },
}));

type CheckRateLimit = typeof import('../check-rate-limit').checkRateLimit;

const makeReq = (ip: string | null = '203.0.113.5') => {
  const headers = new Headers();
  if (ip !== null) headers.set('x-forwarded-for', ip);
  return { headers } as unknown as Parameters<CheckRateLimit>[0];
};

const importFresh = async (): Promise<{ checkRateLimit: CheckRateLimit }> => {
  vi.resetModules();
  return (await import('../check-rate-limit')) as { checkRateLimit: CheckRateLimit };
};

const baseEnv = {
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-123',
  IP_HASH_SALT: 'salt-xyz',
};

describe('checkRateLimit', () => {
  beforeEach(() => {
    mockLimit.mockReset();
    for (const key of [
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'IP_HASH_SALT',
      'RATE_LIMIT_STRICT_PER_MIN',
      'RATE_LIMIT_STANDARD_PER_MIN',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-1: returns ok=true when Upstash ENV is missing (non-production)', async () => {
    process.env.IP_HASH_SALT = 'salt-xyz';
    Object.assign(process.env, { NODE_ENV: 'test' });
    const { checkRateLimit } = await importFresh();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await checkRateLimit(makeReq(), 'strict');

    expect(result).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('TC-1b: fail-closed with backend_unavailable when ENV missing in production', async () => {
    process.env.IP_HASH_SALT = 'salt-xyz';
    const originalNodeEnv = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: 'production' });
    const { checkRateLimit } = await importFresh();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await checkRateLimit(makeReq(), 'strict');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('backend_unavailable');
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  });

  it('TC-2: returns ok=true when IP_HASH_SALT is missing', async () => {
    process.env.UPSTASH_REDIS_REST_URL = baseEnv.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = baseEnv.UPSTASH_REDIS_REST_TOKEN;
    const { checkRateLimit } = await importFresh();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await checkRateLimit(makeReq(), 'standard');

    expect(result).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('TC-3: strict policy: ok=true under 10 req/min', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 30_000,
    });
    const { checkRateLimit } = await importFresh();

    const result = await checkRateLimit(makeReq(), 'strict');

    expect(result.ok).toBe(true);
    expect(mockLimit).toHaveBeenCalledOnce();
  });

  it('TC-4: strict policy: ok=false at 11th request', async () => {
    Object.assign(process.env, baseEnv);
    const resetAt = Date.now() + 45_000;
    mockLimit.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: resetAt,
    });
    const { checkRateLimit } = await importFresh();

    const result = await checkRateLimit(makeReq(), 'strict');

    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it('TC-5: strict policy: fail-closed with backend_unavailable reason when Upstash throws', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockRejectedValue(new Error('upstash down'));
    const { checkRateLimit } = await importFresh();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await checkRateLimit(makeReq(), 'strict');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('backend_unavailable');
    expect(result.retryAfter).toBeGreaterThan(0);
    errSpy.mockRestore();
  });

  it('TC-6: standard policy: ok=true under 60 req/min', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockResolvedValue({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 30_000,
    });
    const { checkRateLimit } = await importFresh();

    const result = await checkRateLimit(makeReq(), 'standard');

    expect(result.ok).toBe(true);
  });

  it('TC-7: standard policy: fail-soft to LRU when Upstash throws', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockRejectedValue(new Error('upstash down'));
    const { checkRateLimit } = await importFresh();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First request should fall back to LRU and be allowed.
    const result = await checkRateLimit(makeReq('198.51.100.7'), 'standard');

    expect(result.ok).toBe(true);
    errSpy.mockRestore();
  });

  it('TC-8: standard policy: LRU hard cap 100/min', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockRejectedValue(new Error('upstash down'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-24T10:00:00Z'));
    const { checkRateLimit } = await importFresh();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ip = '198.51.100.8';
    // 100 allowed
    let lastOk = true;
    for (let i = 0; i < 100; i++) {
      const r = await checkRateLimit(makeReq(ip), 'standard');
      if (!r.ok) lastOk = false;
    }
    expect(lastOk).toBe(true);

    // 101st should be blocked
    const blocked = await checkRateLimit(makeReq(ip), 'standard');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    errSpy.mockRestore();
  });

  it('TC-8b: LRU memory bound: map.size <= 1000 after 2000 unique IPs', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockRejectedValue(new Error('upstash down'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-24T10:00:00Z'));
    vi.resetModules();
    const mod = (await import('../check-rate-limit')) as {
      checkRateLimit: CheckRateLimit;
      __internal: {
        lruSize: () => number;
        resetLruForTests: () => void;
      };
    };
    mod.__internal.resetLruForTests();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (let i = 0; i < 2000; i++) {
      await mod.checkRateLimit(makeReq(`10.0.${Math.floor(i / 256)}.${i % 256}`), 'standard');
    }

    expect(mod.__internal.lruSize()).toBeLessThanOrEqual(1000);
    errSpy.mockRestore();
  });

  it('TC-9: IP is hashed with SHA-256 and salt', async () => {
    Object.assign(process.env, baseEnv);
    mockLimit.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 30_000,
    });
    const { checkRateLimit } = await importFresh();

    const ip = '203.0.113.42';
    const expectedHash = crypto
      .createHash('sha256')
      .update(ip + baseEnv.IP_HASH_SALT)
      .digest('hex')
      .slice(0, 32);

    await checkRateLimit(makeReq(ip), 'strict');

    expect(mockLimit).toHaveBeenCalled();
    const identifier = mockLimit.mock.calls[0][0];
    expect(identifier).toContain(expectedHash);
  });

  it('TC-10: ENV override: RATE_LIMIT_STRICT_PER_MIN=5 blocks after 5 req', async () => {
    Object.assign(process.env, baseEnv);
    process.env.RATE_LIMIT_STRICT_PER_MIN = '5';
    mockLimit.mockImplementation(async () => {
      // This mock simply echoes that Upstash is called — but we also want to
      // verify that the configured per-minute count reaches the Ratelimit
      // constructor. To keep the test simple, assert via the slidingWindow mock.
      return {
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 20_000,
      };
    });
    const { checkRateLimit } = await importFresh();

    const result = await checkRateLimit(makeReq(), 'strict');
    expect(result.ok).toBe(false);

    // Verify the slidingWindow was configured with the override value
    const { Ratelimit } = await import('@upstash/ratelimit');
    const slidingWindowMock = (Ratelimit as unknown as { slidingWindow: ReturnType<typeof vi.fn> })
      .slidingWindow;
    const calls = slidingWindowMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBe(5);
  });
});
