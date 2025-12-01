/**
 * 블로그 콘텐츠 자동화 파이프라인
 * 전체 워크플로우 오케스트레이션
 */

import { searchGoogle, checkApiUsage } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors } from './_services/web-scraper';
import {
  generateBlogContent,
  generateSlug,
  refineContent,
} from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { TARGET_KEYWORDS } from './_config/pipeline-config';
import type {
  BlogPostCreateInput,
  PipelineResult,
  PipelineProgress,
} from './_types/blog';

/**
 * 진행 상태 로깅
 */
function logProgress(progress: PipelineProgress): void {
  const stageEmojis: Record<string, string> = {
    search: '🔍',
    scrape: '🕷️',
    analyze: '📊',
    generate: '🤖',
    validate: '✅',
    save: '💾',
  };

  const emoji = stageEmojis[progress.stage] || '📝';
  console.log(`${emoji} [${progress.stage.toUpperCase()}] ${progress.message} (${progress.progress}%)`);
}

/**
 * 단일 키워드에 대한 블로그 포스트 생성
 */
export async function generateBlogPost(
  targetKeyword: string,
  contentType: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide',
  options: {
    publish?: boolean;
    maxCompetitors?: number;
  } = {}
): Promise<PipelineResult> {
  const { publish = false, maxCompetitors = 5 } = options;
  const startTime = Date.now();
  const metrics = {
    totalTime: 0,
    serpApiCalls: 0,
    pagesScraped: 0,
    tokensUsed: 0,
  };

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 블로그 콘텐츠 생성 파이프라인 시작`);
  console.log(`   키워드: "${targetKeyword}"`);
  console.log(`   콘텐츠 타입: ${contentType}`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    // Stage 1: SerpApi 검색
    logProgress({ stage: 'search', progress: 10, message: '구글 검색 결과 수집 중...' });
    const searchResults = await searchGoogle(targetKeyword, maxCompetitors);
    metrics.serpApiCalls = 1;

    if (searchResults.length === 0) {
      throw new Error('검색 결과가 없습니다.');
    }

    // Stage 2: 웹 스크래핑
    logProgress({ stage: 'scrape', progress: 30, message: '경쟁사 페이지 스크래핑 중...' });
    const scrapedContents = await scrapeSearchResults(searchResults);
    metrics.pagesScraped = scrapedContents.length;

    if (scrapedContents.length === 0) {
      throw new Error('스크래핑된 콘텐츠가 없습니다.');
    }

    // Stage 3: 경쟁사 분석
    logProgress({ stage: 'analyze', progress: 50, message: '경쟁사 콘텐츠 분석 중...' });
    const competitorAnalysis = analyzeCompetitors(scrapedContents, targetKeyword);

    // Stage 4: 콘텐츠 생성
    logProgress({ stage: 'generate', progress: 70, message: 'AI 콘텐츠 생성 중...' });
    let generatedContent = await generateBlogContent(
      targetKeyword,
      competitorAnalysis,
      contentType
    );

    // Stage 4.5: 콘텐츠 개선
    generatedContent = await refineContent(generatedContent);

    // Stage 5: 유효성 검증
    logProgress({ stage: 'validate', progress: 85, message: '콘텐츠 검증 중...' });
    const slug = generateSlug(generatedContent.title);

    // BlogPostCreateInput 생성
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
      competitor_urls: searchResults.map((r) => r.link),
      competitor_count: scrapedContents.length,
      faq_items: generatedContent.faqItems,
      status: publish ? 'published' : 'draft',
    };

    // Stage 6: 저장
    logProgress({ stage: 'save', progress: 95, message: 'DB에 저장 중...' });
    const savedPost = await saveBlogPost(blogPostInput);

    // 발행 옵션
    if (publish) {
      await publishBlogPost(savedPost.slug);
    }

    metrics.totalTime = Date.now() - startTime;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎉 파이프라인 완료!`);
    console.log(`   슬러그: ${savedPost.slug}`);
    console.log(`   상태: ${publish ? 'published' : 'draft'}`);
    console.log(`   소요 시간: ${(metrics.totalTime / 1000).toFixed(1)}초`);
    console.log(`${'='.repeat(80)}\n`);

    return {
      success: true,
      blogPost: blogPostInput,
      metrics,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ 파이프라인 실패: ${errorMessage}`);

    metrics.totalTime = Date.now() - startTime;

    return {
      success: false,
      error: errorMessage,
      metrics,
    };
  }
}

/**
 * 배치 블로그 포스트 생성 (여러 키워드)
 */
export async function generateBlogPostsBatch(
  keywords: Array<{ keyword: string; type: 'comparison' | 'guide' | 'listicle' | 'review' }>,
  options: {
    publish?: boolean;
    delayBetweenPosts?: number;
  } = {}
): Promise<PipelineResult[]> {
  const { publish = false, delayBetweenPosts = 5000 } = options;
  const results: PipelineResult[] = [];

  console.log(`\n${'#'.repeat(80)}`);
  console.log(`📦 배치 블로그 생성 시작 (${keywords.length}개 키워드)`);
  console.log(`${'#'.repeat(80)}\n`);

  // API 사용량 확인
  const usage = await checkApiUsage();
  console.log(`📊 SerpApi 사용량: ${usage.used}/${usage.limit} (잔여: ${usage.remaining})`);

  if (usage.remaining < keywords.length) {
    console.warn(`⚠️ 잔여 API 호출 수가 부족합니다. ${usage.remaining}개만 처리합니다.`);
    keywords = keywords.slice(0, usage.remaining);
  }

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, type } = keywords[i];
    console.log(`\n📝 [${i + 1}/${keywords.length}] "${keyword}" 처리 중...`);

    const result = await generateBlogPost(keyword, type, { publish });
    results.push(result);

    // 다음 키워드 전 딜레이 (마지막 제외)
    if (i < keywords.length - 1) {
      console.log(`⏳ ${delayBetweenPosts / 1000}초 대기 중...`);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenPosts));
    }
  }

  // 결과 요약
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\n${'#'.repeat(80)}`);
  console.log(`📊 배치 완료 결과`);
  console.log(`   성공: ${successful}개`);
  console.log(`   실패: ${failed}개`);
  console.log(`${'#'.repeat(80)}\n`);

  return results;
}

/**
 * 사전 정의된 타겟 키워드로 블로그 생성
 */
export async function generateFromTargetKeywords(
  options: {
    publish?: boolean;
    priorityFilter?: number;
    limit?: number;
  } = {}
): Promise<PipelineResult[]> {
  const { publish = false, priorityFilter, limit } = options;

  let keywords = [...TARGET_KEYWORDS];

  // 우선순위 필터
  if (priorityFilter !== undefined) {
    keywords = keywords.filter((k) => k.priority <= priorityFilter);
  }

  // 개수 제한
  if (limit !== undefined) {
    keywords = keywords.slice(0, limit);
  }

  const keywordInputs = keywords.map((k) => ({
    keyword: k.keyword,
    type: k.type,
  }));

  return generateBlogPostsBatch(keywordInputs, { publish });
}