/**
 * Smoke test for @sendgrid/mail SDK.
 *
 * Verifies the SDK surface our newsletter pipeline depends on (default export
 * with setApiKey and send) remains stable after the security upgrade in T8.
 * No network — we only exercise setApiKey and confirm send is a callable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import sgMail from '@sendgrid/mail';

describe('[@sendgrid/mail] SDK smoke', () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    originalApiKey = process.env.SENDGRID_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.SENDGRID_API_KEY;
    } else {
      process.env.SENDGRID_API_KEY = originalApiKey;
    }
  });

  it('exposes setApiKey and send on the default export', () => {
    expect(sgMail).toBeDefined();
    expect(typeof sgMail.setApiKey).toBe('function');
    expect(typeof sgMail.send).toBe('function');
  });

  it('accepts an API key via setApiKey without throwing', () => {
    expect(() => sgMail.setApiKey('SG.test-placeholder-key')).not.toThrow();
  });
});
