import { describe, expect, it } from 'vitest';

import { faqData } from '@/lib/constants/seo/faq-data';
import { siteConfig } from '@/lib/constants/seo/config';
import { metadataConfig } from '@/lib/constants/seo/metadata';
import { schemaConfig } from '@/lib/constants/seo/schema';
import { formatKSTDateFromTimestamp } from '@/lib/tli/date-utils';

describe('theme count consistency', () => {
  it('uses 230 as the static active-theme floor', () => {
    expect(siteConfig.themeCountFloor).toBe(230);
  });

  it('uses the floor in metadata and structured-data descriptions without a literal 200', () => {
    const descriptions = [
      metadataConfig.description,
      schemaConfig.serviceDesc,
      schemaConfig.websiteDesc,
    ];

    for (const description of descriptions) {
      expect(description).toContain(String(siteConfig.themeCountFloor));
      expect(description).not.toContain('200');
    }
  });

  it('does not keep the old theme-count wording in TLI FAQ answers', () => {
    const tliAnswers = faqData
      .filter(({ question }) => question.includes('테마'))
      .map(({ answer }) => answer);

    expect(tliAnswers.length).toBeGreaterThan(0);
    expect(tliAnswers.join('\n')).not.toContain('200개 이상');
  });
});

describe('theme detail as-of date', () => {
  it('formats the loaded score timestamp in KST', () => {
    expect(formatKSTDateFromTimestamp('2026-09-01T15:30:00.000Z')).toBe('2026-09-02');
  });

  it('returns null when no real score timestamp exists', () => {
    expect(formatKSTDateFromTimestamp(null)).toBeNull();
  });
});
