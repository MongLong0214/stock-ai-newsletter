import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const TARGET_FILES = [
  'app/layout.tsx',
  'app/about/layout.tsx',
  'app/faq/layout.tsx',
  'app/archive/layout.tsx',
  'app/subscribe/layout.tsx',
  'app/technical-indicators/layout.tsx',
  'app/unsubscribe/layout.tsx',
  'app/blog/_utils/schema-generator.ts',
  'app/blog/_prompts/keyword-generation.ts',
  'app/blog/_prompts/seo-guidelines.ts',
  'lib/constants/seo/internal-links.ts',
  'lib/sendgrid.ts',
  'app/opengraph-image.tsx',
  'app/archive/opengraph-image.tsx',
  'app/faq/opengraph-image.tsx',
  'app/about/opengraph-image.tsx',
  'app/unsubscribe/opengraph-image.tsx',
  'app/blog/opengraph-image.tsx',
  'app/blog/[slug]/opengraph-image.tsx',
  'app/blog/tag/[tag]/opengraph-image.tsx',
  'app/subscribe/opengraph-image.tsx',
  'app/technical-indicators/opengraph-image.tsx',
  'app/themes/opengraph-image.tsx',
  'app/themes/twitter-image.tsx',
  'app/themes/methodology/opengraph-image.tsx',
  'app/themes/[id]/opengraph-image.tsx',
  'app/developers/opengraph-image.tsx',
  'app/faq/_components/faq-section.tsx',
  'app/blog/page.tsx',
  'app/blog/tag/[tag]/page.tsx',
  'app/blog/[slug]/page.tsx',
  'app/blog/_components/blog-list/blog-card.tsx',
  'app/blog/[slug]/_components/cta-section.tsx',
  'app/about/_components/service-intro-section.tsx',
  'app/_components/shared/footer.tsx',
  'app/_components/shared/navigation/logo.tsx',
  'lib/constants/seo/technical-indicators-content.tsx',
  'lib/constants/seo/faq-data.ts',
  'app/feed.xml/route.ts',
  'lib/newsletter/verify-sent.ts',
  'lib/__tests__/sendgrid-send.test.ts',
  'lib/constants/seo/keywords.ts',
] as const;

const PRESERVED_OCCURRENCES = [
  // This is the external Google Play app's proper name, not our service name.
  { filePath: 'app/layout.tsx', text: "'Stock Matrix - Alerts & News'" },
  // This Organization alias intentionally consolidates searches for the spaced brand form.
  { filePath: 'app/layout.tsx', text: "alternateName: ['Stock Matrix', siteConfig.serviceNameKo]" },
  // This intentional keyword alias consolidates searches for the spaced brand form.
  { filePath: 'lib/constants/seo/keywords.ts', text: "brand: [serviceName, serviceNameKo, 'Stock Matrix']" },
] as const;

function removeCommentLines(source: string): string {
  let insideBlockComment = false;

  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();

      if (insideBlockComment) {
        if (trimmed.includes('*/')) insideBlockComment = false;
        return false;
      }

      if (trimmed.startsWith('//')) return false;
      if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
        insideBlockComment = !trimmed.includes('*/');
        return false;
      }

      return true;
    })
    .join('\n');
}

describe('brand notation', () => {
  it('uses StockMatrix throughout SEO-impacting files except for explicit aliases', () => {
    for (const filePath of TARGET_FILES) {
      let source = readFileSync(resolve(process.cwd(), filePath), 'utf8');

      for (const occurrence of PRESERVED_OCCURRENCES) {
        if (occurrence.filePath !== filePath) continue;

        expect(source, `${filePath} must preserve ${occurrence.text}`).toContain(occurrence.text);
        source = source.replace(occurrence.text, '');
      }

      source = removeCommentLines(source);
      expect(source, `${filePath} contains a non-whitelisted spaced brand`).not.toContain('Stock Matrix');
    }
  });
});
