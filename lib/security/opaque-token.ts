/**
 * Opaque authenticated-encryption tokens (AES-256-GCM).
 *
 * Properties:
 * - Email is encrypted inside ciphertext; never exposed in URL.
 * - Purpose-bound (unsubscribe, confirm, etc.) inside AAD.
 * - Expiry is bound inside ciphertext.
 * - Random 12-byte nonce prevents reuse attacks.
 * - Key rotation: supports UNSUBSCRIBE_TOKEN_SECRET and UNSUBSCRIBE_TOKEN_SECRET_PREV.
 * - Secret must be >= 32 characters (enforced on both encrypt and decrypt).
 *
 * Token wire format (base64url):
 *   <keyId:1><nonce:12><ciphertext+tag:variable>
 *
 * Plaintext layout (JSON):
 *   { "e": email, "exp": epochSec, "p": purpose }
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

export type TokenPurpose = 'unsubscribe' | 'confirm';

export interface TokenPayload {
  email: string;
  purpose: TokenPurpose;
}

export interface TokenDecryptResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: 'expired' | 'tampered' | 'malformed' | 'no_secret';
}

const ALGORITHM = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_ID_LEN = 1;
const MIN_SECRET_LENGTH = 32;

// Key IDs: 0x01 = current, 0x02 = previous (for rotation)
const KEY_ID_CURRENT = 0x01;
const KEY_ID_PREV = 0x02;

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function getKeys(): { current?: Buffer; prev?: Buffer } {
  const currentSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  const prevSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET_PREV;

  return {
    current: currentSecret && currentSecret.length >= MIN_SECRET_LENGTH
      ? deriveKey(currentSecret)
      : undefined,
    prev: prevSecret && prevSecret.length >= MIN_SECRET_LENGTH
      ? deriveKey(prevSecret)
      : undefined,
  };
}

/**
 * Encrypt a token payload.
 * Throws if UNSUBSCRIBE_TOKEN_SECRET is not configured or < 32 chars (fail-closed).
 */
export function encryptToken(email: string, purpose: TokenPurpose, ttlSeconds: number): string {
  const { current } = getKeys();
  if (!current) {
    throw new Error('UNSUBSCRIBE_TOKEN_SECRET must be configured (>=32 chars) for token generation');
  }

  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const plaintext = Buffer.from(JSON.stringify({ e: email, exp, p: purpose }), 'utf8');

  const nonce = randomBytes(NONCE_LEN);
  const aad = Buffer.from(purpose, 'utf8');

  const cipher = createCipheriv(ALGORITHM, current, nonce, { authTagLength: TAG_LEN });
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const wire = Buffer.concat([Buffer.from([KEY_ID_CURRENT]), nonce, encrypted, tag]);
  return wire.toString('base64url');
}

/**
 * Decrypt and validate a token.
 * Fail-closed: returns error if no valid secret is configured (>=32 chars).
 */
export function decryptToken(token: string, expectedPurpose: TokenPurpose): TokenDecryptResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'malformed' };
  }

  let wire: Buffer;
  try {
    wire = Buffer.from(token, 'base64url');
  } catch {
    return { valid: false, error: 'malformed' };
  }

  if (wire.length < KEY_ID_LEN + NONCE_LEN + TAG_LEN + 1) {
    return { valid: false, error: 'malformed' };
  }

  const keyId = wire[0];
  const nonce = wire.subarray(KEY_ID_LEN, KEY_ID_LEN + NONCE_LEN);
  const ciphertextAndTag = wire.subarray(KEY_ID_LEN + NONCE_LEN);
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - TAG_LEN);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - TAG_LEN);

  const { current, prev } = getKeys();

  // Determine which key(s) to try
  const keysToTry: Buffer[] = [];
  if (keyId === KEY_ID_CURRENT && current) keysToTry.push(current);
  else if (keyId === KEY_ID_PREV && prev) keysToTry.push(prev);
  // Also try both for robustness during rotation
  if (current && !keysToTry.includes(current)) keysToTry.push(current);
  if (prev && !keysToTry.includes(prev)) keysToTry.push(prev);

  if (keysToTry.length === 0) {
    return { valid: false, error: 'no_secret' };
  }

  const aad = Buffer.from(expectedPurpose, 'utf8');

  for (const key of keysToTry) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_LEN });
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      let payload: { e?: string; exp?: number; p?: string };
      try {
        payload = JSON.parse(decrypted.toString('utf8'));
      } catch {
        continue;
      }

      if (!payload.e || !payload.exp || payload.p !== expectedPurpose) {
        return { valid: false, error: 'tampered' };
      }

      if (Math.floor(Date.now() / 1000) > payload.exp) {
        return { valid: false, error: 'expired' };
      }

      return {
        valid: true,
        payload: { email: payload.e, purpose: expectedPurpose },
      };
    } catch {
      continue;
    }
  }

  return { valid: false, error: 'tampered' };
}
