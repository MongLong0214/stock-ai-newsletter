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
] as const;

const PRESERVED_OCCURRENCES = [
  // This is the external Google Play app's proper name, not our service name.
  { filePath: 'app/layout.tsx', text: "'Stock Matrix - Alerts & News'" },
  // This Organization alias intentionally consolidates searches for the spaced brand form.
  { filePath: 'app/layout.tsx', text: "alternateName: ['Stock Matrix', siteConfig.serviceNameKo]" },
] as const;

describe('brand notation', () => {
  it('uses StockMatrix throughout SEO-impacting files except for explicit aliases', () => {
    for (const filePath of TARGET_FILES) {
      let source = readFileSync(resolve(process.cwd(), filePath), 'utf8');

      for (const occurrence of PRESERVED_OCCURRENCES) {
        if (occurrence.filePath !== filePath) continue;

        expect(source, `${filePath} must preserve ${occurrence.text}`).toContain(occurrence.text);
        source = source.replace(occurrence.text, '');
      }

      expect(source, `${filePath} contains a non-whitelisted spaced brand`).not.toContain('Stock Matrix');
    }
  });
});
