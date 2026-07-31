/**
 * Distributed rate limiter backed by Supabase (PostgreSQL).
 *
 * Design:
 * - Atomic fixed-window counter via INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
 * - IP identifier is HMAC(server-secret, trusted_platform_ip) — never stores raw IP.
 * - Trusts only `x-real-ip` (set by Vercel edge, not caller-supplied).
 * - FAIL-CLOSED: returns unavailable when configuration/store/RPC fails.
 * - Requires RATE_LIMIT_HMAC_SECRET (minimum 32 characters).
 * - Resolves env per call (no module-load constants).
 */

import { createHmac } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitConfig {
  /** Identifier scope/bucket (e.g. 'subscribe', 'stock_price') */
  bucket: string;
  /** Maximum requests in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

export type RateLimitResult =
  | { status: 'allowed'; remaining: number; resetAt: number }
  | { status: 'limited'; remaining: 0; resetAt: number }
  | { status: 'unavailable'; reason: string };

// ─── Configuration (resolved per call) ───

function getHmacSecret(): string | null {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

interface ServiceClientCache {
  url: string;
  key: string;
  client: SupabaseClient;
}

let serviceClientCache: ServiceClientCache | null = null;

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (serviceClientCache?.url === url && serviceClientCache.key === key) {
    return serviceClientCache.client;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  serviceClientCache = { url, key, client };
  return client;
}

/**
 * Hash the client IP with server-side HMAC.
 * Returns null if HMAC secret is not configured (fail-closed signal).
 */
export function hashClientIp(ip: string, bucket: string): string | null {
  const secret = getHmacSecret();
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`${bucket}:${ip}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Extract the trusted client IP from the request.
 * Only trusts `x-real-ip` which is set by Vercel's edge infrastructure.
 * Returns null if the header is missing or not a syntactically valid IP.
 */
export function getTrustedClientIp(headers: { get(name: string): string | null }): string | null {
  const ip = headers.get('x-real-ip');
  if (!ip) return null;
  // Basic syntax check: IPv4 or IPv6 (including brackets)
  const trimmed = ip.trim();
  if (trimmed.length === 0 || trimmed.length > 45) return null;
  // Must look like an IP (digits/dots/colons/brackets)
  if (!/^[\d.:a-fA-F[\]]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Check rate limit against the distributed atomic counter.
 *
 * FAIL-CLOSED: returns { status: 'unavailable' } when:
 * - RATE_LIMIT_HMAC_SECRET is missing or < 32 chars
 * - Supabase URL/service key is missing
 * - Trusted IP is missing
 * - RPC call fails
 */
export async function checkRateLimit(
  ip: string | null,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Fail-closed: require trusted IP
  if (!ip) {
    return { status: 'unavailable', reason: 'no_trusted_ip' };
  }

  // Fail-closed: require HMAC secret
  const ipHash = hashClientIp(ip, config.bucket);
  if (!ipHash) {
    return { status: 'unavailable', reason: 'hmac_secret_missing_or_short' };
  }

  // Fail-closed: require Supabase
  const client = getServiceClient();
  if (!client) {
    return { status: 'unavailable', reason: 'supabase_not_configured' };
  }

  try {
    const { data, error } = await client.rpc('check_rate_limit', {
      p_identity_hash: ipHash,
      p_bucket: config.bucket,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });

    if (error) {
      console.error('[rate-limit] RPC error (fail-closed):', error.message);
      return { status: 'unavailable', reason: 'rpc_error' };
    }

    const result = data as {
      limited: boolean;
      request_count: number;
      window_start: number;
      window_seconds: number;
    } | null;

    if (!result) {
      return { status: 'unavailable', reason: 'rpc_null_response' };
    }

    const resetAt = result.window_start + result.window_seconds;

    if (result.limited) {
      return { status: 'limited', remaining: 0, resetAt };
    }
    return {
      status: 'allowed',
      remaining: Math.max(0, config.maxRequests - result.request_count),
      resetAt,
    };
  } catch (err) {
    console.error('[rate-limit] unexpected error (fail-closed):', err instanceof Error ? err.message : 'unknown');
    return { status: 'unavailable', reason: 'exception' };
  }
}

// ─── Preset configurations ───

export const RATE_LIMITS = {
  subscribe: { bucket: 'subscribe', maxRequests: 5, windowSeconds: 60 } as RateLimitConfig,
  unsubscribe: { bucket: 'unsubscribe', maxRequests: 10, windowSeconds: 60 } as RateLimitConfig,
  stockPrice: { bucket: 'stock_price', maxRequests: 30, windowSeconds: 60 } as RateLimitConfig,
  dailyClose: { bucket: 'daily_close', maxRequests: 30, windowSeconds: 60 } as RateLimitConfig,
  newsletter: { bucket: 'newsletter', maxRequests: 2, windowSeconds: 3600 } as RateLimitConfig,
} as const;
