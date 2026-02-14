/**
 * 블로그 초안 생성 — 검색 + 스크래핑 + AI 콘텐츠 생성
 */

import { searchGoogle } from '@/app/blog/_services/serp-api';
import {
  scrapeSearchResults,
  analyzeCompetitors,
  resetMetrics,
  getMetrics,
} from '@/app/blog/_services/web-scraper';
import { generateSlug } from '@/app/blog/_utils/slug-generator';
import type { Provider, BlogPostCreateInput, ContentType, PipelineResult, DraftMetrics } from '../types';
import { TIMEOUTS } from '../constants';
import { err, withTimeout, withTimeoutFallback } from '../utils';
import { generateBlogContent, calculateQualityScore } from './content';

export async function generateBlogPost(
  providers: Provider[],
  keyword: string,
  type: ContentType = 'guide',
): Promise<PipelineResult> {
  const start = Date.now();
  const metrics: DraftMetrics = { totalTime: 0, pagesScraped: 0, qualityScore: 0 };

  console.log(`\n${'='.repeat(50)}\n[Pipeline] "${keyword}" (${type})\n${'='.repeat(50)}`);

  try {
    // 1. 검색 + 스크래핑
    const searchResults = await withTimeoutFallback(searchGoogle(keyword, 5), TIMEOUTS.search, [], 'Search');
    if (!searchResults.length) console.log('[Pipeline] 검색 결과 없음 — AI 자체 지식으로 생성');

    resetMetrics();
    const scraped = await withTimeoutFallback(scrapeSearchResults(searchResults), TIMEOUTS.scrape, [], 'Scrape');
    metrics.pagesScraped = scraped.length;
    const m = getMetrics();
    if (m.totalAttempts) console.log(`[Pipeline] 스크래핑: ${m.successCount}/${m.totalAttempts}`);

    // 2. 분석 + AI 생성
    const analysis = analyzeCompetitors(scraped, keyword);
    const content = await withTimeout(generateBlogContent(providers, keyword, analysis, type), TIMEOUTS.generate, 'AI');
    metrics.qualityScore = calculateQualityScore(content, keyword, analysis);

    // 3. 포스트 객체 (저장은 publish.ts에서 담당)
    const post: BlogPostCreateInput = {
      slug: generateSlug(content.title, keyword),
      title: content.title,
      description: content.description,
      content: content.content,
      meta_title: content.metaTitle,
      meta_description: content.metaDescription,
      target_keyword: keyword,
      secondary_keywords: content.suggestedTags,
      tags: content.suggestedTags,
      competitor_urls: searchResults.map((r) => r.link),
      competitor_count: scraped.length,
      faq_items: content.faqItems,
      status: 'draft',
    };

    metrics.totalTime = Date.now() - start;
    console.log(`[Pipeline] 완료: Q=${metrics.qualityScore} (${(metrics.totalTime / 1000).toFixed(1)}초)`);
    return { success: true, blogPost: post, metrics };
  } catch (e) {
    console.error(`[Pipeline] 실패: ${err(e)}`);
    metrics.totalTime = Date.now() - start;
    return { success: false, error: err(e), metrics };
  }
}
