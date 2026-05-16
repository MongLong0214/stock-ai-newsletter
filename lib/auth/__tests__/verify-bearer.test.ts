import { describe, it, expect } from 'vitest';

import { verifyBearerToken } from '../verify-bearer';

const makeRequest = (authHeader?: string): Request => {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return new Request('http://localhost/api/test', { headers });
};

describe('verifyBearerToken', () => {
  it('returns false when secret is undefined', () => {
    expect(verifyBearerToken(makeRequest('Bearer whatever'), undefined)).toBe(false);
  });

  it('returns false when secret is empty string', () => {
    expect(verifyBearerToken(makeRequest('Bearer whatever'), '')).toBe(false);
  });

  it('returns false when secret is whitespace only', () => {
    expect(verifyBearerToken(makeRequest('Bearer whatever'), '   ')).toBe(false);
  });

  it('returns false when Authorization header missing', () => {
    expect(verifyBearerToken(makeRequest(), 'valid-secret')).toBe(false);
  });

  it('returns false when Authorization prefix is not Bearer', () => {
    expect(verifyBearerToken(makeRequest('Basic dXNlcjpwYXNz'), 'valid-secret')).toBe(false);
  });

  it('returns false with wrong token (same length)', () => {
    expect(verifyBearerToken(makeRequest('Bearer aaaaaaaaa'), 'bbbbbbbbb')).toBe(false);
  });

  it('returns false with wrong token (different length)', () => {
    expect(verifyBearerToken(makeRequest('Bearer short'), 'much-longer-secret')).toBe(false);
  });

  it('returns true with correct bearer token', () => {
    const secret = 'correct-secret-value';
    expect(verifyBearerToken(makeRequest(`Bearer ${secret}`), secret)).toBe(true);
  });

  it('returns false when Bearer prefix without token', () => {
    expect(verifyBearerToken(makeRequest('Bearer '), 'valid-secret')).toBe(false);
  });

  it('returns false with base64 token containing high-bit bytes vs ASCII secret', () => {
    // Base64-encoded multi-byte payload — still ASCII on the wire
    const encoded = Buffer.from('안녕', 'utf8').toString('base64');
    expect(verifyBearerToken(makeRequest(`Bearer ${encoded}`), 'valid-secret')).toBe(false);
  });

  it('returns false when token exceeds MAX_TOKEN_BYTES (512)', () => {
    const longToken = 'x'.repeat(600);
    expect(verifyBearerToken(makeRequest(`Bearer ${longToken}`), 'short-secret')).toBe(false);
  });

  it('rest parameter: accepts current secret when old secret is also set', () => {
    expect(verifyBearerToken(makeRequest('Bearer current'), 'current', 'old')).toBe(true);
  });

  it('rest parameter: accepts old secret during rotation', () => {
    expect(verifyBearerToken(makeRequest('Bearer old-key'), 'new-key', 'old-key')).toBe(true);
  });

  it('rest parameter: rejects when neither secret matches', () => {
    expect(verifyBearerToken(makeRequest('Bearer wrong'), 'current', 'old')).toBe(false);
  });

  it('rest parameter: ignores undefined and empty secrets', () => {
    expect(verifyBearerToken(makeRequest('Bearer real'), undefined, '', 'real')).toBe(true);
  });

  it('returns false when all secrets are undefined/empty', () => {
    expect(verifyBearerToken(makeRequest('Bearer any'), undefined, '', '   ')).toBe(false);
  });
});
