import crypto from 'node:crypto';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import * as lru from './lru';

export type RateLimitPolicy = 'strict' | 'standard';

export type RateLimitReason = 'quota_exceeded' | 'backend_unavailable';

export type RateLimitResult = {
  ok: boolean;
  retryAfter?: number;
  reason?: RateLimitReason;
};

type HeaderLike = {
  headers: { get: (name: string) => string | null };
};

const DEFAULT_STRICT_PER_MIN = 10;
const DEFAULT_STANDARD_PER_MIN = 60;
const LRU_HARD_CAP_PER_MIN = 100;

let envWarned = false;
let strictLimiter: Ratelimit | null = null;
let standardLimiter: Ratelimit | null = null;
let cachedStrictLimit = -1;
let cachedStandardLimit = -1;

const warnOnce = (message: string): void => {
  if (envWarned) return;
  envWarned = true;
  console.warn(`[rate-limit] ${message}`);
};

const getEnvNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const extractIp = (req: HeaderLike): string => {
  const header = req.headers.get('x-forwarded-for');
  if (!header) return 'unknown';
  const first = header.split(',')[0]?.trim();
  return first || 'unknown';
};

const hashIp = (ip: string, salt: string): string =>
  crypto
    .createHash('sha256')
    .update(ip + salt)
    .digest('hex')
    .slice(0, 32);

const retryAfterFrom = (resetMs: number): number => {
  const diff = Math.ceil((resetMs - Date.now()) / 1000);
  return Math.max(1, diff);
};

const isUpstashConfigured = (): boolean =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const isSaltConfigured = (): boolean => Boolean(process.env.IP_HASH_SALT);

const getLimiter = (policy: RateLimitPolicy): Ratelimit => {
  const strictPerMin = getEnvNumber('RATE_LIMIT_STRICT_PER_MIN', DEFAULT_STRICT_PER_MIN);
  const standardPerMin = getEnvNumber('RATE_LIMIT_STANDARD_PER_MIN', DEFAULT_STANDARD_PER_MIN);

  if (policy === 'strict') {
    if (!strictLimiter || cachedStrictLimit !== strictPerMin) {
      strictLimiter = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(strictPerMin, '60 s'),
        prefix: 'rl:strict',
      });
      cachedStrictLimit = strictPerMin;
    }
    return strictLimiter;
  }

  if (!standardLimiter || cachedStandardLimit !== standardPerMin) {
    standardLimiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(standardPerMin, '60 s'),
      prefix: 'rl:standard',
    });
    cachedStandardLimit = standardPerMin;
  }
  return standardLimiter;
};

/**
 * Check a request against the configured rate-limit policy.
 *
 * - `strict`: Upstash only. fail-closed (503) on Upstash errors.
 * - `standard`: Upstash first, falls back to in-memory LRU on Upstash failure
 *   with a hard cap of 100 req/min/IP to prevent abuse during outages.
 *
 * In development (Upstash env vars or IP_HASH_SALT unset), returns `{ ok: true }`
 * with a one-time warn log.
 */
export async function checkRateLimit(
  req: HeaderLike,
  policy: RateLimitPolicy
): Promise<RateLimitResult> {
  if (!isUpstashConfigured() || !isSaltConfigured()) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // fail-closed in production to surface misconfiguration instead of
      // silently disabling rate-limiting.
      console.error(
        '[rate-limit] misconfigured in production: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN / IP_HASH_SALT missing — failing closed'
      );
      return { ok: false, retryAfter: 60, reason: 'backend_unavailable' };
    }
    warnOnce(
      'rate-limit disabled (non-production): UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN / IP_HASH_SALT missing'
    );
    return { ok: true };
  }

  const ip = extractIp(req);
  const salt = process.env.IP_HASH_SALT as string;
  const identifier = `${policy}:${hashIp(ip, salt)}`;

  try {
    const limiter = getLimiter(policy);
    const res = await limiter.limit(identifier);
    if (res.success) return { ok: true };
    return {
      ok: false,
      retryAfter: retryAfterFrom(res.reset),
      reason: 'quota_exceeded',
    };
  } catch (err) {
    console.error('[rate-limit] upstash error', err);

    if (policy === 'strict') {
      // fail-closed: surface backend-unavailable so caller can return 503.
      return { ok: false, retryAfter: 60, reason: 'backend_unavailable' };
    }

    // standard: fall back to in-memory LRU at 100 req/min hard cap.
    const lruRes = lru.hit(identifier, LRU_HARD_CAP_PER_MIN);
    return lruRes.ok
      ? { ok: true }
      : { ok: false, retryAfter: lruRes.retryAfter, reason: 'quota_exceeded' };
  }
}

export const __internal = {
  lruSize: () => lru.size(),
  resetLruForTests: () => lru.__resetForTests(),
};
