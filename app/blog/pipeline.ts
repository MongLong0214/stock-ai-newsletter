import { searchGoogle } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug } from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import { notifyGoogleIndexingBatch } from '@/lib/google-indexing';
import type { BlogPostCreateInput, PipelineResult } from './_types/blog';

const TIMEOUTS = { search: 60_000, scrape: 120_000, generate: 180_000, save: 30_000, keyword: 90_000 };
const BATCH_DELAY_MS = 3_000;
const err = (e: unknown) => e instanceof Error ? e.message : String(e);

async function withTimeout<R>(p: Promise<R>, ms: number, label: string): Promise<R> {
  let t: NodeJS.Timeout;
  try {
    return await Promise.race([
      p,
      new Promise<R>((_, reject) => { t = setTimeout(() => reject(new Error(`${label} 타임아웃`)), ms); }),
    ]);
  } finally {
    clearTimeout(t!);
  }
}

async function withTimeoutFallback<R>(p: Promise<R>, ms: number, fallback: R, label: string): Promise<R> {
  try { return await withTimeout(p, ms, label); } catch { console.warn(`[Pipeline] ${label} 타임아웃 — fallback`); return fallback; }
}

export async function generateBlogPost(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide', publish = false): Promise<PipelineResult> {
  const start = Date.now();
  const metrics = { totalTime: 0, pagesScraped: 0 };

  console.log(`\n${'='.repeat(50)}\n[Pipeline] "${keyword}" (${type})\n${'='.repeat(50)}`);

  try {
    // 1. 검색 + 스크래핑
    // 검색 결과 0건이어도 계속 진행 — AI가 자체 지식으로 콘텐츠 생성 가능 (의도적 설계)
    const searchResults = await withTimeoutFallback(searchGoogle(keyword, 5), TIMEOUTS.search, [], 'Search');
    if (!searchResults.length) console.log('[Pipeline] 검색 결과 없음 — AI 자체 지식으로 생성');

    resetMetrics();
    const scraped = await withTimeoutFallback(scrapeSearchResults(searchResults), TIMEOUTS.scrape, [], 'Scrape');
    metrics.pagesScraped = scraped.length;
    const m = getMetrics();
    if (m.totalAttempts) console.log(`[Pipeline] 스크래핑: ${m.successCount}/${m.totalAttempts}`);

    // 2. 분석 + AI 생성
    const analysis = analyzeCompetitors(scraped, keyword);
    const content = await withTimeout(generateBlogContent(keyword, analysis, type), TIMEOUTS.generate, 'AI');

    // 3. 저장
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
      competitor_urls: searchResults.map(r => r.link),
      competitor_count: scraped.length,
      faq_items: content.faqItems,
      status: publish ? 'published' : 'draft',
    };

    const saved = await withTimeout(saveBlogPost(post), TIMEOUTS.save, 'DB');
    if (publish) {
      await publishBlogPost(saved.slug).catch(e => console.warn('[Pipeline] publish 실패:', err(e)));
      notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${saved.slug}`,
        'https://stockmatrix.co.kr/sitemap.xml',
      ]).catch(e => console.warn('[Pipeline] 인덱싱 알림 실패:', err(e)));
    }

    metrics.totalTime = Date.now() - start;
    console.log(`[Pipeline] 완료: ${saved.slug} (${(metrics.totalTime / 1000).toFixed(1)}초)`);
    return { success: true, blogPost: post, metrics };
  } catch (e) {
    console.error(`[Pipeline] 실패: ${err(e)}`);
    metrics.totalTime = Date.now() - start;
    return { success: false, error: err(e), metrics };
  }
}

export async function generateBlogPostsBatch(keywords: Array<{ keyword: string; type: 'comparison' | 'guide' | 'listicle' | 'review' }>, publish = false): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  console.log(`\n${'#'.repeat(50)}\n[Pipeline] 배치: ${keywords.length}개\n${'#'.repeat(50)}`);

  for (let i = 0; i < keywords.length; i++) {
    console.log(`\n[${i + 1}/${keywords.length}] "${keywords[i].keyword}"`);
    results.push(await generateBlogPost(keywords[i].keyword, keywords[i].type, publish));
    if (i < keywords.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  await closeBrowser().catch(() => {});
  const ok = results.filter(r => r.success).length;
  console.log(`\n${'#'.repeat(50)}\n[Pipeline] 완료: ${ok} 성공 / ${results.length - ok} 실패\n${'#'.repeat(50)}`);
  return results;
}

export async function generateWithDynamicKeywords(options: { publish?: boolean; count?: number } = {}): Promise<PipelineResult[]> {
  const { publish = false, count = 5 } = options;

  console.log(`\n${'#'.repeat(50)}\n[Pipeline] AI 키워드 생성 (${count}개)\n${'#'.repeat(50)}`);

  try {
    const result = await withTimeoutFallback(generateKeywords(count), TIMEOUTS.keyword, { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' }, 'Keyword');
    if (!result.success || !result.keywords.length) { console.error(`[Pipeline] 키워드 생성 실패: ${result.error || '키워드 없음'}`); return []; }
    console.log(`[Pipeline] ${result.keywords.length}개 키워드 생성`);
    return generateBlogPostsBatch(result.keywords.map(k => ({ keyword: k.keyword, type: k.contentType })), publish);
  } catch (e) {
    console.error(`[Pipeline] ${err(e)}`);
    return [];
  }
}
