/**
 * Timing-safe authentication utilities.
 * Prevents timing side-channels by using constant-time comparison.
 *
 * Token operations delegate to AEAD opaque-token module.
 * No legacy HMAC token code.
 */

import { timingSafeEqual } from 'crypto';
import { encryptToken, decryptToken, type TokenDecryptResult } from './opaque-token';

/**
 * Constant-time comparison of two strings.
 * Returns false if either value is empty/undefined.
 */
export function timingSafeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate a Bearer token against the expected CRON_SECRET.
 * Fail-closed: returns false if CRON_SECRET is unset or empty.
 */
export function validateCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) {
    return false;
  }
  if (!authHeader) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return timingSafeCompare(token, secret);
}

// --- Opaque token wrappers (AEAD, no email in URL) ---

/**
 * Generate an opaque unsubscribe token for a given email.
 * Throws if UNSUBSCRIBE_TOKEN_SECRET is not configured (>=32 chars, fail-closed).
 * Default TTL: 30 days.
 */
export function generateUnsubscribeToken(email: string, ttlSeconds = 30 * 24 * 60 * 60): string {
  return encryptToken(email, 'unsubscribe', ttlSeconds);
}

/**
 * Generate an opaque confirmation token for double opt-in.
 * Default TTL: 24 hours.
 */
export function generateConfirmToken(email: string, ttlSeconds = 24 * 60 * 60): string {
  return encryptToken(email, 'confirm', ttlSeconds);
}

export interface TokenValidationResult {
  valid: boolean;
  email?: string;
  error?: 'expired' | 'tampered' | 'malformed' | 'no_secret';
}

/**
 * Validate and decode an unsubscribe token.
 */
export function validateUnsubscribeToken(token: string): TokenValidationResult {
  const result = decryptToken(token, 'unsubscribe');
  return mapResult(result);
}

/**
 * Validate and decode a confirmation token.
 */
export function validateConfirmToken(token: string): TokenValidationResult {
  const result = decryptToken(token, 'confirm');
  return mapResult(result);
}

function mapResult(result: TokenDecryptResult): TokenValidationResult {
  if (result.valid && result.payload) {
    return { valid: true, email: result.payload.email };
  }
  return { valid: false, error: result.error };
}
