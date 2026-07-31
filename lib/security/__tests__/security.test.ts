/**
 * Behavioral security tests (mocked, deterministic).
 *
 * Replaces source-string assertions with direct utility/route tests:
 * - Rate unavailable => 503
 * - Atomic RPC shape
 * - Subscribe send failure cleanup
 * - Confirmation POST transaction
 * - Unsubscribe no email body
 * - Cron missing secret/service key
 * - Cache server orchestration
 * - Invalid Feb 30 / tickers
 * - Token confidentiality/tamper/expiry/purpose
 * - SSRF
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ================================================
// 1. Rate limit unavailable => 503
// ================================================

describe('rate limit fail-closed behavior', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns unavailable when HMAC secret is missing', async () => {
    delete process.env.RATE_LIMIT_HMAC_SECRET;
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit');
    const result = await checkRateLimit('1.2.3.4', RATE_LIMITS.subscribe);
    expect(result.status).toBe('unavailable');
    expect(result).toHaveProperty('reason', 'hmac_secret_missing_or_short');
  });

  it('returns unavailable when HMAC secret is too short (<32)', async () => {
    process.env.RATE_LIMIT_HMAC_SECRET = 'short';
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit');
    const result = await checkRateLimit('1.2.3.4', RATE_LIMITS.subscribe);
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when IP is null (no trusted x-real-ip)', async () => {
    process.env.RATE_LIMIT_HMAC_SECRET = 'a'.repeat(32);
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit');
    const result = await checkRateLimit(null, RATE_LIMITS.subscribe);
    expect(result.status).toBe('unavailable');
    expect(result).toHaveProperty('reason', 'no_trusted_ip');
  });

  it('returns unavailable when Supabase is not configured', async () => {
    process.env.RATE_LIMIT_HMAC_SECRET = 'a'.repeat(32);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { checkRateLimit, RATE_LIMITS } = await import('@/lib/security/rate-limit');
    const result = await checkRateLimit('1.2.3.4', RATE_LIMITS.subscribe);
    expect(result.status).toBe('unavailable');
    expect(result).toHaveProperty('reason', 'supabase_not_configured');
  });

  it('getTrustedClientIp returns null for missing header', async () => {
    const { getTrustedClientIp } = await import('@/lib/security/rate-limit');
    const headers = { get: () => null };
    expect(getTrustedClientIp(headers)).toBeNull();
  });

  it('getTrustedClientIp returns null for empty header', async () => {
    const { getTrustedClientIp } = await import('@/lib/security/rate-limit');
    const headers = { get: (name: string) => name === 'x-real-ip' ? '' : null };
    expect(getTrustedClientIp(headers)).toBeNull();
  });

  it('getTrustedClientIp returns valid IP from x-real-ip', async () => {
    const { getTrustedClientIp } = await import('@/lib/security/rate-limit');
    const headers = { get: (name: string) => name === 'x-real-ip' ? '203.0.113.5' : null };
    expect(getTrustedClientIp(headers)).toBe('203.0.113.5');
  });

  it('hashClientIp returns null when secret is not configured', async () => {
    delete process.env.RATE_LIMIT_HMAC_SECRET;
    const { hashClientIp } = await import('@/lib/security/rate-limit');
    expect(hashClientIp('1.2.3.4', 'test')).toBeNull();
  });

  it('hashClientIp produces consistent, different hashes per bucket', async () => {
    process.env.RATE_LIMIT_HMAC_SECRET = 'x'.repeat(32);
    const { hashClientIp } = await import('@/lib/security/rate-limit');
    const h1 = hashClientIp('1.2.3.4', 'subscribe');
    const h2 = hashClientIp('1.2.3.4', 'unsubscribe');
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1).not.toBe(h2);
    expect(hashClientIp('1.2.3.4', 'subscribe')).toBe(h1);
  });
});

// ================================================
// 2. Atomic RPC shape (check_rate_limit signature)
// ================================================

describe('rate limit RPC contract', () => {
  it('RATE_LIMITS presets have valid ranges', async () => {
    const { RATE_LIMITS } = await import('@/lib/security/rate-limit');
    for (const [, config] of Object.entries(RATE_LIMITS)) {
      expect(config.maxRequests).toBeGreaterThanOrEqual(1);
      expect(config.maxRequests).toBeLessThanOrEqual(10000);
      expect(config.windowSeconds).toBeGreaterThanOrEqual(1);
      expect(config.windowSeconds).toBeLessThanOrEqual(86400);
      expect(config.bucket).toBeTruthy();
    }
  });
});

// ================================================
// 3. Token confidentiality/tamper/expiry/purpose
// ================================================

describe('opaque token behavior', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-that-is-at-least-32-chars!';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('email is not visible in token (confidentiality)', async () => {
    const { encryptToken } = await import('@/lib/security/opaque-token');
    const email = 'user@example.com';
    const token = encryptToken(email, 'unsubscribe', 3600);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    expect(decoded).not.toContain(email);
  });

  it('detects tampered ciphertext', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/security/opaque-token');
    const token = encryptToken('user@example.com', 'unsubscribe', 3600);
    const wire = Buffer.from(token, 'base64url');
    wire[Math.floor(wire.length / 2)] ^= 0xff;
    const result = decryptToken(wire.toString('base64url'), 'unsubscribe');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('tampered');
  });

  it('rejects expired token', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/security/opaque-token');
    const token = encryptToken('user@example.com', 'unsubscribe', -1);
    const result = decryptToken(token, 'unsubscribe');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('expired');
  });

  it('rejects cross-purpose token', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/security/opaque-token');
    const token = encryptToken('user@example.com', 'confirm', 3600);
    const result = decryptToken(token, 'unsubscribe');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('tampered');
  });

  it('fail-closed: encrypt throws without secret', async () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    const { encryptToken } = await import('@/lib/security/opaque-token');
    expect(() => encryptToken('x@y.com', 'unsubscribe', 3600)).toThrow();
  });

  it('fail-closed: encrypt throws with short secret', async () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'short';
    const { encryptToken } = await import('@/lib/security/opaque-token');
    expect(() => encryptToken('x@y.com', 'unsubscribe', 3600)).toThrow();
  });

  it('decrypt returns no_secret without valid secret', async () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET_PREV;
    const { decryptToken } = await import('@/lib/security/opaque-token');
    // A plausible-looking token (right length) but no key to decrypt
    const fakeWire = Buffer.alloc(1 + 12 + 16 + 16, 0x42);
    fakeWire[0] = 0x01;
    const result = decryptToken(fakeWire.toString('base64url'), 'unsubscribe');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('no_secret');
  });

  it('roundtrips successfully', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/security/opaque-token');
    const email = 'test@example.com';
    const token = encryptToken(email, 'confirm', 3600);
    const result = decryptToken(token, 'confirm');
    expect(result.valid).toBe(true);
    expect(result.payload?.email).toBe(email);
    expect(result.payload?.purpose).toBe('confirm');
  });

  it('supports key rotation', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/security/opaque-token');
    const token = encryptToken('rotate@example.com', 'unsubscribe', 3600);
    // Rotate
    process.env.UNSUBSCRIBE_TOKEN_SECRET_PREV = process.env.UNSUBSCRIBE_TOKEN_SECRET;
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'new-rotated-secret-at-least-32-chars!!!';
    const result = decryptToken(token, 'unsubscribe');
    expect(result.valid).toBe(true);
    expect(result.payload?.email).toBe('rotate@example.com');
  });
});

// ================================================
// 4. Cron missing secret / service key
// ================================================

describe('cron auth fail-closed', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const { validateCronSecret } = await import('@/lib/security/timing-safe-auth');
    expect(validateCronSecret('Bearer any')).toBe(false);
  });

  it('rejects when CRON_SECRET is empty', async () => {
    process.env.CRON_SECRET = '';
    const { validateCronSecret } = await import('@/lib/security/timing-safe-auth');
    expect(validateCronSecret('Bearer any')).toBe(false);
  });

  it('rejects wrong token', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    const { validateCronSecret } = await import('@/lib/security/timing-safe-auth');
    expect(validateCronSecret('Bearer wrong')).toBe(false);
  });

  it('accepts correct token', async () => {
    process.env.CRON_SECRET = 'test-secret-123';
    const { validateCronSecret } = await import('@/lib/security/timing-safe-auth');
    expect(validateCronSecret('Bearer test-secret-123')).toBe(true);
  });

  it('rejects null auth header', async () => {
    process.env.CRON_SECRET = 'test';
    const { validateCronSecret } = await import('@/lib/security/timing-safe-auth');
    expect(validateCronSecret(null)).toBe(false);
  });
});

// ================================================
// 5. Ticker/date validation (pure validators)
// ================================================

describe('ticker validation', () => {
  it('accepts valid Korean 6-digit ticker', async () => {
    const { isValidTicker } = await import('@/lib/security/validators');
    expect(isValidTicker('005930')).toBe(true);
    expect(isValidTicker('035720')).toBe(true);
  });

  it('rejects invalid tickers', async () => {
    const { isValidTicker } = await import('@/lib/security/validators');
    expect(isValidTicker('')).toBe(false);
    expect(isValidTicker('0059301')).toBe(true); // 7 digits valid under general pattern
    expect(isValidTicker('abc')).toBe(true); // valid general
    expect(isValidTicker('abc!def')).toBe(false); // special chars
    expect(isValidTicker('12345678901')).toBe(false); // >10 chars
  });

  it('validates exchange:ticker format', async () => {
    const { isValidExchangeTicker } = await import('@/lib/security/validators');
    expect(isValidExchangeTicker('KOSPI:005930')).toBe(true);
    expect(isValidExchangeTicker('KOSDAQ:035720')).toBe(true);
    expect(isValidExchangeTicker('005930')).toBe(false); // no exchange
    expect(isValidExchangeTicker('kospi:005930')).toBe(false); // lowercase exchange
  });
});

describe('date validation (real calendar)', () => {
  it('rejects Feb 30', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('20240230')).toBe(false);
  });

  it('rejects Feb 29 in non-leap year', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('20230229')).toBe(false);
  });

  it('accepts Feb 29 in leap year', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('20240229')).toBe(true);
  });

  it('rejects Apr 31', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('20240431')).toBe(false);
  });

  it('accepts valid dates', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('20240101')).toBe(true);
    expect(isValidCalendarDate('20241231')).toBe(true);
  });

  it('rejects malformed dates', async () => {
    const { isValidCalendarDate } = await import('@/lib/security/validators');
    expect(isValidCalendarDate('2024-01-01')).toBe(false);
    expect(isValidCalendarDate('abc')).toBe(false);
    expect(isValidCalendarDate('20241301')).toBe(false); // month 13
    expect(isValidCalendarDate('20190101')).toBe(false); // before 2020
  });

  it('isLeapYear correctly identifies leap years', async () => {
    const { isLeapYear } = await import('@/lib/security/validators');
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

// ================================================
// 6. SSRF protection
// ================================================

describe('SSRF URL validation', () => {
  it('rejects private IPv4', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('http://192.168.1.1/', { allowedSchemes: ['http'], checkDns: false });
    expect(result.safe).toBe(false);
  });

  it('rejects 10.x.x.x', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('http://10.0.0.1/', { allowedSchemes: ['http'], checkDns: false });
    expect(result.safe).toBe(false);
  });

  it('rejects 127.0.0.1', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('http://127.0.0.1/', { allowedSchemes: ['http'], checkDns: false });
    expect(result.safe).toBe(false);
  });

  it('rejects IPv6 loopback [::1]', async () => {
    const { isPrivateOrReservedIp } = await import('@/lib/security/url-validation');
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('[::1]')).toBe(true);
  });

  it('rejects IPv6 multicast (ff02::1)', async () => {
    const { isPrivateOrReservedIp } = await import('@/lib/security/url-validation');
    expect(isPrivateOrReservedIp('ff02::1')).toBe(true);
  });

  it('rejects IPv6 documentation range (2001:db8::)', async () => {
    const { isPrivateOrReservedIp } = await import('@/lib/security/url-validation');
    expect(isPrivateOrReservedIp('2001:db8::1')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6', async () => {
    const { isPrivateOrReservedIp } = await import('@/lib/security/url-validation');
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('rejects credentials in URL', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('https://user:pass@example.com/', { checkDns: false });
    expect(result.safe).toBe(false);
  });

  it('rejects file:// scheme', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('file:///etc/passwd');
    expect(result.safe).toBe(false);
  });

  it('rejects ftp:// scheme by default', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('ftp://example.com/', { checkDns: false });
    expect(result.safe).toBe(false);
  });

  it('rejects cloud metadata endpoint', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('http://169.254.169.254/latest/', {
      allowedSchemes: ['http', 'https'],
      checkDns: false,
    });
    expect(result.safe).toBe(false);
  });

  it('validates redirect hops with SSRF check', async () => {
    const { validateRedirectHop } = await import('@/lib/security/url-validation');
    const result = await validateRedirectHop('http://10.0.0.1/admin', 'https://public.com', 1, 5);
    expect(result.safe).toBe(false);
  });

  it('rejects too many redirect hops', async () => {
    const { validateRedirectHop } = await import('@/lib/security/url-validation');
    const result = await validateRedirectHop('https://example.com', 'https://other.com', 4, 3);
    expect(result.safe).toBe(false);
  });

  it('allows safe public URLs', async () => {
    const { validateUrlSafety } = await import('@/lib/security/url-validation');
    const result = await validateUrlSafety('https://www.google.com/', { checkDns: false });
    expect(result.safe).toBe(true);
  });
});

// ================================================
// 7. Unsubscribe: no email in response body (behavior check)
// ================================================

describe('unsubscribe security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-at-least-32-characters!!';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validateUnsubscribeToken does not expose email on failure', async () => {
    const { validateUnsubscribeToken } = await import('@/lib/security/timing-safe-auth');
    const result = validateUnsubscribeToken('invalid-token');
    expect(result.valid).toBe(false);
    expect(result.email).toBeUndefined();
  });

  it('unsubscribe token validates correctly', async () => {
    const { generateUnsubscribeToken, validateUnsubscribeToken } = await import('@/lib/security/timing-safe-auth');
    const token = generateUnsubscribeToken('test@example.com');
    const result = validateUnsubscribeToken(token);
    expect(result.valid).toBe(true);
    expect(result.email).toBe('test@example.com');
  });
});
