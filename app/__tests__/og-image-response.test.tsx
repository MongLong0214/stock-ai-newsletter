import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('createOgImageResponse', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('falls back to rendering without custom fonts when font files fail to load', async () => {
    const imageResponseMock = vi.fn();
    class MockImageResponse {
      fonts: unknown;

      constructor(_element: unknown, options: { fonts: unknown }) {
        imageResponseMock(_element, options);
        this.fonts = options.fonts;
      }
    }

    vi.doMock('next/og', () => ({
      ImageResponse: MockImageResponse,
    }));

    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(new Error('missing font')),
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createOgImageResponse } = await import('@/lib/og-image-response');

    const result = await createOgImageResponse(
      React.createElement('div', null, 'fallback'),
      {
        width: 1200,
        height: 630,
      }
    );

    expect(imageResponseMock).toHaveBeenCalledTimes(1);
    expect((result as unknown as { fonts: unknown[] }).fonts).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
