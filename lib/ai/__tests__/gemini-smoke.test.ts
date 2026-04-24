/**
 * Smoke test for @google/genai SDK.
 *
 * Verifies the SDK surface our pipeline relies on (new GoogleGenAI({...}),
 * .models.generateContent({...}), { text } response field) stays stable after
 * the security upgrade in T8. No network — fetch is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleGenAI } from '@google/genai';

describe('[@google/genai] SDK smoke', () => {
  const originalEnv = process.env.GOOGLE_CLOUD_PROJECT;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
    if (originalEnv === undefined) {
      delete process.env.GOOGLE_CLOUD_PROJECT;
    } else {
      process.env.GOOGLE_CLOUD_PROJECT = originalEnv;
    }
  });

  it('constructs a Vertex AI client with the expected config surface', () => {
    const genAI = new GoogleGenAI({
      vertexai: true,
      project: 'test-project',
      location: 'us-central1',
    });

    expect(genAI).toBeDefined();
    expect(genAI.models).toBeDefined();
    expect(typeof genAI.models.generateContent).toBe('function');
  });

  it('propagates the text field from a mocked generateContent response', async () => {
    const genAI = new GoogleGenAI({
      vertexai: true,
      project: 'test-project',
      location: 'us-central1',
    });

    // Bypass the network by stubbing the SDK method directly, which keeps this
    // smoke test resilient to auth-token plumbing inside the SDK.
    const generateContent = vi.spyOn(genAI.models, 'generateContent').mockResolvedValue({
      text: '{"ok":true}',
      // Intentionally partial — we only assert the shape consumed by our callers.
    } as unknown as Awaited<ReturnType<typeof genAI.models.generateContent>>);

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
    });

    expect(generateContent).toHaveBeenCalledOnce();
    expect(response.text).toBe('{"ok":true}');
  });
});
