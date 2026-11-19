import { describe, expect, it } from 'vitest';
import { generateSlug } from '../slug-generator';
import { isValidBlogSlug } from '../slug-validator';

describe('generateSlug', () => {
  it('keeps long English titles under the public route limit, cut at a word boundary', () => {
    const slug = generateSlug('Investment '.repeat(18).trim(), '키워드');
    expect(isValidBlogSlug(slug)).toBe(true);
    expect(slug).toMatch(/^(investment-)+investment-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  });

  it('leaves short slugs alone', () => {
    expect(generateSlug('삼성전자 배당금 analysis', '삼성전자 배당금')).toMatch(/^analysis-\d{4}-\d{2}-\d{2}-[a-z0-9]+$/);
  });
});
