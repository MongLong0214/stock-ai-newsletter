import { searchGoogle, checkApiUsage } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug } from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import type { BlogPostCreateInput, PipelineResult } from './_types/blog';

const T = { search: 60000, scrape: 120000, generate: 180000, save: 30000, keyword: 90000 };
const err = (e: unknown) => e instanceof Error ? e.message : String(e);

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p.then(v => { clearTimeout(t); return v; }), new Promise<T>(r => { t = setTimeout(() => { console.warn(`⏰ ${label} 타임아웃`); r(fallback); }, ms); })]);
}

export async function generateBlogPost(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide', publish = false): Promise<PipelineResult> {
  const start = Date.now();
  const metrics = { totalTime: 0, serpApiCalls: 1, pagesScraped: 0, tokensUsed: 0 };

  console.log(`\n${'='.repeat(50)}\n🚀 "${keyword}" (${type})\n${'='.repeat(50)}`);

  try {
    // 1. 검색 + 스크래핑
    const searchResults = await withTimeout(searchGoogle(keyword, 5), T.search, [], 'Search');
    if (!searchResults.length) console.log('⚠️ 검색 결과 없음');

    resetMetrics();
    const scraped = await withTimeout(scrapeSearchResults(searchResults), T.scrape, [], 'Scrape');
    metrics.pagesScraped = scraped.length;
    const m = getMetrics();
    if (m.totalAttempts) console.log(`📊 스크래핑: ${m.successCount}/${m.totalAttempts}`);

    // 2. 분석 + AI 생성
    const analysis = analyzeCompetitors(scraped, keyword);
    const content = await withTimeout(generateBlogContent(keyword, analysis, type), T.generate, null as any, 'AI');
    if (!content) throw new Error('AI 타임아웃');

    // 3. 저장
    const post: BlogPostCreateInput = {
      slug: generateSlug(content.title),
      title: content.title,
      description: content.description,
      content: content.content,
      meta_title: content.metaTitle,
      meta_description: content.metaDescription,
      target_keyword: keyword,
      secondary_keywords: content.suggestedTags,
      category: 'stock-newsletter',
      tags: content.suggestedTags,
      competitor_urls: searchResults.map(r => r.link),
      competitor_count: scraped.length,
      faq_items: content.faqItems,
      status: publish ? 'published' : 'draft',
    };

    const saved = await withTimeout(saveBlogPost(post), T.save, null as any, 'DB');
    if (!saved) throw new Error('DB 타임아웃');
    if (publish) await publishBlogPost(saved.slug).catch(() => {});

    metrics.totalTime = Date.now() - start;
    console.log(`✅ ${saved.slug} (${(metrics.totalTime / 1000).toFixed(1)}초)`);
    return { success: true, blogPost: post, metrics };
  } catch (e) {
    console.error(`❌ ${err(e)}`);
    metrics.totalTime = Date.now() - start;
    return { success: false, error: err(e), metrics };
  }
}

export async function generateBlogPostsBatch(keywords: Array<{ keyword: string; type: 'comparison' | 'guide' | 'listicle' | 'review' }>, publish = false): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  console.log(`\n${'#'.repeat(50)}\n📦 배치: ${keywords.length}개\n${'#'.repeat(50)}`);

  try {
    const usage = await withTimeout(checkApiUsage(), 10000, { used: 0, limit: 100, remaining: 100 }, 'API');
    console.log(`SerpApi: ${usage.remaining}개 남음`);
    if (usage.remaining < keywords.length) keywords = keywords.slice(0, Math.max(usage.remaining, 1));
  } catch {}

  for (let i = 0; i < keywords.length; i++) {
    console.log(`\n[${i + 1}/${keywords.length}] "${keywords[i].keyword}"`);
    try {
      results.push(await generateBlogPost(keywords[i].keyword, keywords[i].type, publish));
    } catch (e) {
      results.push({ success: false, error: err(e), metrics: { totalTime: 0, serpApiCalls: 0, pagesScraped: 0, tokensUsed: 0 } });
    }
    if (i < keywords.length - 1) await new Promise(r => setTimeout(r, 3000));
  }

  await closeBrowser().catch(() => {});
  const ok = results.filter(r => r.success).length;
  console.log(`\n${'#'.repeat(50)}\n📊 완료: ✅${ok} ❌${results.length - ok}\n${'#'.repeat(50)}`);
  return results;
}

export async function generateWithDynamicKeywords(options: { publish?: boolean; count?: number; minRelevanceScore?: number } = {}): Promise<PipelineResult[]> {
  const { publish = false, count = 5, minRelevanceScore = 7.5 } = options;

  console.log(`\n${'#'.repeat(50)}\n🤖 AI 키워드 생성 (${count}개, 최소${minRelevanceScore}점)\n${'#'.repeat(50)}`);

  try {
    const result = await withTimeout(generateKeywords(count, { minRelevanceScore }), T.keyword, { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' }, 'Keyword');
    if (!result.success || !result.keywords.length) { console.error(`❌ ${result.error || '키워드 없음'}`); return []; }
    console.log(`✅ ${result.keywords.length}개 생성`);
    return generateBlogPostsBatch(result.keywords.map(k => ({ keyword: k.keyword, type: k.contentType })), publish);
  } catch (e) {
    console.error(`❌ ${err(e)}`);
    return [];
  }
}
