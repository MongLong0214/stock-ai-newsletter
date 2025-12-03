/**
 * 블로그 콘텐츠 자동화 파이프라인 (엔터프라이즈급)
 */

import { searchGoogle, checkApiUsage } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug } from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import type { BlogPostCreateInput, PipelineResult } from './_types/blog';

const TIMEOUTS = { search: 60000, scrape: 120000, generate: 180000, save: 30000, keyword: 90000 };

function log(stage: string, msg: string, pct: number): void {
  const emoji: Record<string, string> = { search: '🔍', scrape: '🕷️', analyze: '📊', generate: '🤖', save: '💾' };
  console.log(`${emoji[stage] || '📝'} [${stage.toUpperCase()}] ${msg} (${pct}%)`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label?: string): Promise<T> {
  let tid: NodeJS.Timeout;
  return Promise.race([
    promise.then(v => { clearTimeout(tid); return v; }),
    new Promise<T>(r => { tid = setTimeout(() => { console.warn(`⏰ ${label || 'Timeout'} (${ms}ms)`); r(fallback); }, ms); })
  ]);
}

export async function generateBlogPost(
  targetKeyword: string,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide',
  options: { publish?: boolean; maxCompetitors?: number } = {}
): Promise<PipelineResult> {
  const { publish = false, maxCompetitors = 5 } = options;
  const startTime = Date.now();
  const metrics = { totalTime: 0, serpApiCalls: 0, pagesScraped: 0, tokensUsed: 0 };

  console.log(`\n${'='.repeat(60)}\n🚀 "${targetKeyword}" (${contentType})\n${'='.repeat(60)}`);

  try {
    // 1. 검색
    log('search', '구글 검색 중...', 10);
    const searchResults = await withTimeout(searchGoogle(targetKeyword, maxCompetitors), TIMEOUTS.search, [], 'Search');
    metrics.serpApiCalls = 1;
    if (!searchResults.length) console.log('   ⚠️ 검색 결과 없음 - 기본 분석으로 진행');

    // 2. 스크래핑
    log('scrape', '페이지 스크래핑 중...', 30);
    resetMetrics();
    const scrapedContents = await withTimeout(scrapeSearchResults(searchResults), TIMEOUTS.scrape, [], 'Scrape');
    metrics.pagesScraped = scrapedContents.length;
    const m = getMetrics();
    if (m.totalAttempts > 0) console.log(`   📊 스크래핑: ${m.successCount}/${m.totalAttempts} 성공`);

    // 3. 분석
    log('analyze', '콘텐츠 분석 중...', 50);
    const competitorAnalysis = analyzeCompetitors(scrapedContents, targetKeyword);

    // 4. AI 생성 (가장 오래 걸림 - 3분 타임아웃)
    log('generate', 'AI 콘텐츠 생성 중...', 70);
    const generatedContent = await withTimeout(
      generateBlogContent(targetKeyword, competitorAnalysis, contentType),
      TIMEOUTS.generate,
      null as any,
      'AI Generate'
    );
    if (!generatedContent) throw new Error('AI 콘텐츠 생성 타임아웃');

    // 5. 저장
    log('save', 'DB 저장 중...', 90);
    const slug = generateSlug(generatedContent.title);
    const blogPostInput: BlogPostCreateInput = {
      slug,
      title: generatedContent.title,
      description: generatedContent.description,
      content: generatedContent.content,
      meta_title: generatedContent.metaTitle,
      meta_description: generatedContent.metaDescription,
      target_keyword: targetKeyword,
      secondary_keywords: generatedContent.suggestedTags,
      category: 'stock-newsletter',
      tags: generatedContent.suggestedTags,
      competitor_urls: searchResults.map(r => r.link),
      competitor_count: scrapedContents.length,
      faq_items: generatedContent.faqItems,
      status: publish ? 'published' : 'draft',
    };

    const savedPost = await withTimeout(saveBlogPost(blogPostInput), TIMEOUTS.save, null as any, 'DB Save');
    if (!savedPost) throw new Error('DB 저장 타임아웃');

    if (publish) await publishBlogPost(savedPost.slug).catch(() => {});

    metrics.totalTime = Date.now() - startTime;
    console.log(`✅ 완료: ${savedPost.slug} (${(metrics.totalTime / 1000).toFixed(1)}초)`);
    return { success: true, blogPost: blogPostInput, metrics };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ 실패: ${msg}`);
    metrics.totalTime = Date.now() - startTime;
    return { success: false, error: msg, metrics };
  }
}

export async function generateBlogPostsBatch(
  keywords: Array<{ keyword: string; type: 'comparison' | 'guide' | 'listicle' | 'review' }>,
  options: { publish?: boolean; delayBetweenPosts?: number } = {}
): Promise<PipelineResult[]> {
  const { publish = false, delayBetweenPosts = 3000 } = options;
  const results: PipelineResult[] = [];

  console.log(`\n${'#'.repeat(60)}\n📦 배치 생성: ${keywords.length}개 키워드\n${'#'.repeat(60)}`);

  try {
    const usage = await withTimeout(checkApiUsage(), 10000, { used: 0, limit: 100, remaining: 100 }, 'API Check');
    console.log(`📊 SerpApi: ${usage.used}/${usage.limit} (잔여: ${usage.remaining})`);
    if (usage.remaining < keywords.length) {
      console.warn(`⚠️ API 부족 - ${usage.remaining}개만 처리`);
      keywords = keywords.slice(0, Math.max(usage.remaining, 1));
    }
  } catch { console.log('⚠️ API 체크 실패 - 계속 진행'); }

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, type } = keywords[i];
    console.log(`\n📝 [${i + 1}/${keywords.length}] "${keyword}"`);

    try {
      results.push(await generateBlogPost(keyword, type, { publish }));
    } catch (error) {
      console.error(`❌ 예외: ${error instanceof Error ? error.message : error}`);
      results.push({ success: false, error: String(error), metrics: { totalTime: 0, serpApiCalls: 0, pagesScraped: 0, tokensUsed: 0 } });
    }

    if (i < keywords.length - 1) await new Promise(r => setTimeout(r, delayBetweenPosts));
  }

  await closeBrowser().catch(() => {});

  const ok = results.filter(r => r.success).length;
  console.log(`\n${'#'.repeat(60)}\n📊 배치 완료: ✅ ${ok}개 성공, ❌ ${results.length - ok}개 실패\n${'#'.repeat(60)}`);
  return results;
}

export async function generateWithDynamicKeywords(
  options: { publish?: boolean; count?: number; minRelevanceScore?: number } = {}
): Promise<PipelineResult[]> {
  const { publish = false, count = 5, minRelevanceScore = 7.5 } = options;

  console.log(`\n${'#'.repeat(60)}\n🤖 AI 동적 키워드 블로그 생성\n   개수: ${count}, 최소점수: ${minRelevanceScore}\n${'#'.repeat(60)}`);

  try {
    const keywordResult = await withTimeout(
      generateKeywords(count, { minRelevanceScore }),
      TIMEOUTS.keyword,
      { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' },
      'Keyword Gen'
    );

    if (!keywordResult.success || !keywordResult.keywords.length) {
      console.error(`❌ 키워드 생성 실패: ${keywordResult.error || '없음'}`);
      return [];
    }

    console.log(`✅ ${keywordResult.keywords.length}개 키워드 생성됨`);
    return await generateBlogPostsBatch(keywordResult.keywords.map(kw => ({ keyword: kw.keyword, type: kw.contentType })), { publish });
  } catch (error) {
    console.error(`❌ 동적 키워드 생성 실패: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
