/**
 * 블로그 콘텐츠 자동화 파이프라인 (엔터프라이즈급)
 * - 스크래핑 실패해도 계속 진행
 * - 개별 키워드 실패해도 다음 처리
 * - 단계별 타임아웃
 */

import { searchGoogle, checkApiUsage } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug } from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import type { BlogPostCreateInput, PipelineResult, PipelineProgress } from './_types/blog';

const STAGE_TIMEOUT = 60000; // 60초

function log(stage: string, msg: string, pct: number): void {
  const emoji: Record<string, string> = { search: '🔍', scrape: '🕷️', analyze: '📊', generate: '🤖', validate: '✅', save: '💾' };
  console.log(`${emoji[stage] || '📝'} [${stage.toUpperCase()}] ${msg} (${pct}%)`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
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
    // Stage 1: 검색
    log('search', '구글 검색 중...', 10);
    const searchResults = await withTimeout(searchGoogle(targetKeyword, maxCompetitors), STAGE_TIMEOUT, []);
    metrics.serpApiCalls = 1;

    if (searchResults.length === 0) {
      console.log('   ⚠️ 검색 결과 없음 - 기본 분석으로 진행');
    }

    // Stage 2: 스크래핑 (실패해도 계속)
    log('scrape', '페이지 스크래핑 중...', 30);
    resetMetrics();
    const scrapedContents = await withTimeout(scrapeSearchResults(searchResults), STAGE_TIMEOUT * 2, []);
    metrics.pagesScraped = scrapedContents.length;

    const scrapingMetrics = getMetrics();
    if (scrapingMetrics.totalAttempts > 0) {
      console.log(`   📊 스크래핑: ${scrapingMetrics.successCount}/${scrapingMetrics.totalAttempts} 성공`);
    }

    // Stage 3: 분석 (스크래핑 0개여도 기본값으로 진행)
    log('analyze', '콘텐츠 분석 중...', 50);
    const competitorAnalysis = analyzeCompetitors(scrapedContents, targetKeyword);

    // Stage 4: AI 콘텐츠 생성
    log('generate', 'AI 콘텐츠 생성 중...', 70);
    const generatedContent = await generateBlogContent(targetKeyword, competitorAnalysis, contentType);

    // Stage 5: 저장
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

    const savedPost = await saveBlogPost(blogPostInput);
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

  // API 사용량 체크
  try {
    const usage = await checkApiUsage();
    console.log(`📊 SerpApi: ${usage.used}/${usage.limit} (잔여: ${usage.remaining})`);
    if (usage.remaining < keywords.length) {
      console.warn(`⚠️ API 부족 - ${usage.remaining}개만 처리`);
      keywords = keywords.slice(0, usage.remaining);
    }
  } catch { console.log('⚠️ API 사용량 체크 실패 - 계속 진행'); }

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, type } = keywords[i];
    console.log(`\n📝 [${i + 1}/${keywords.length}] "${keyword}"`);

    try {
      const result = await generateBlogPost(keyword, type, { publish });
      results.push(result);
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
    const keywordResult = await withTimeout(generateKeywords(count, { minRelevanceScore }), STAGE_TIMEOUT, { success: false, keywords: [], error: 'timeout' });

    if (!keywordResult.success || keywordResult.keywords.length === 0) {
      console.error(`❌ 키워드 생성 실패: ${keywordResult.error || '없음'}`);
      return [];
    }

    console.log(`✅ ${keywordResult.keywords.length}개 키워드 생성됨`);

    const keywordInputs = keywordResult.keywords.map(kw => ({ keyword: kw.keyword, type: kw.contentType }));
    return await generateBlogPostsBatch(keywordInputs, { publish });
  } catch (error) {
    console.error(`❌ 동적 키워드 생성 실패: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
