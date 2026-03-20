import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { withOgImageVersion } from '@/lib/constants/seo/config';

import { metadata as aboutMetadata } from '../about/layout';
import { metadata as archiveMetadata } from '../archive/layout';
import { metadata as blogMetadata } from '../blog/page';
import { metadata as developersMetadata } from '../developers/page';
import { metadata as faqMetadata } from '../faq/layout';
import { metadata as subscribeMetadata } from '../subscribe/layout';
import { metadata as technicalIndicatorsMetadata } from '../technical-indicators/layout';
import { metadata as themesMetadata } from '../themes/(list)/page';
import { metadata as methodologyMetadata } from '../themes/methodology/layout';
import { metadata as unsubscribeMetadata } from '../unsubscribe/layout';

function getFirstImageUrl(value: unknown): string | null {
  if (!value) return null;

  const images = Array.isArray(value) ? value : [value];
  const first = images[0];

  if (!first) return null;
  if (typeof first === 'string') return first;
  if (first instanceof URL) return first.toString();
  if (typeof first === 'object' && first !== null && 'url' in first) {
    const url = (first as { url?: string | URL }).url;
    return url instanceof URL ? url.toString() : (url ?? null);
  }

  return null;
}

function expectMetadataImages(
  metadata: Metadata,
  openGraphPath: string,
  twitterPath = openGraphPath
) {
  expect(getFirstImageUrl(metadata.openGraph?.images)).toBe(
    withOgImageVersion(openGraphPath)
  );
  expect(getFirstImageUrl(metadata.twitter?.images)).toBe(
    withOgImageVersion(twitterPath)
  );
}

describe('OG image metadata wiring', () => {
  it('points section metadata to section-specific OG routes', () => {
    expectMetadataImages(aboutMetadata, '/about/opengraph-image');
    expectMetadataImages(archiveMetadata, '/archive/opengraph-image');
    expectMetadataImages(developersMetadata, '/developers/opengraph-image');
    expectMetadataImages(faqMetadata, '/faq/opengraph-image');
    expectMetadataImages(subscribeMetadata, '/subscribe/opengraph-image');
    expectMetadataImages(
      technicalIndicatorsMetadata,
      '/technical-indicators/opengraph-image'
    );
    expectMetadataImages(
      methodologyMetadata,
      '/themes/methodology/opengraph-image'
    );
    expectMetadataImages(
      themesMetadata,
      '/themes/opengraph-image',
      '/themes/twitter-image'
    );
    expectMetadataImages(blogMetadata, '/blog/opengraph-image');
    expectMetadataImages(unsubscribeMetadata, '/unsubscribe/opengraph-image');
  });

  it('keeps dedicated OG route files for major shareable hubs', () => {
    expect(
      existsSync(resolve(process.cwd(), 'app/blog/opengraph-image.tsx'))
    ).toBe(true);
    expect(
      existsSync(
        resolve(process.cwd(), 'app/blog/tag/[tag]/opengraph-image.tsx')
      )
    ).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), 'app/themes/opengraph-image.tsx'))
    ).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), 'app/themes/twitter-image.tsx'))
    ).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), 'app/unsubscribe/opengraph-image.tsx'))
    ).toBe(true);
  });
});
