import { describe, expect, it } from 'vitest';

import { resolveOgImageVersion } from '@/lib/constants/seo/config';

describe('resolveOgImageVersion', () => {
  it('prefers explicit override when present', () => {
    expect(
      resolveOgImageVersion({
        OG_IMAGE_VERSION: 'manual-override',
        VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
      })
    ).toBe('manual-override');
  });

  it('falls back to deployment identifiers automatically', () => {
    expect(
      resolveOgImageVersion({
        VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
      })
    ).toBe('abcdef123456');
  });

  it('uses a stable development fallback when no deploy identifier exists', () => {
    expect(resolveOgImageVersion({})).toBe('dev-og');
  });
});
