/**
 * 4-Phase 블로그 파이프라인 오케스트레이터
 *
 * Phase 1: AI 키워드 생성 (Vertex AI Gemini + TLI 컨텍스트 + 롤링 윈도우 중복 제거)
 * Phase 2: 초안 생성 (SERP 검색 → 스크래핑 → AI 콘텐츠 생성, 저장 없이)
 * Phase 3: AI 선별 + 중복 검증 (기존 블로그 대비, 상위 N개 선택)
 * Phase 4: 저장 & 발행 + Google Indexing
 */

import { searchGoogle } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug } from './_services/content-generator';
import { saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import { notifyGoogleIndexingBatch } from '@/lib/google-indexing';
import type { BlogPostCreateInput, PipelineResult, PipelineMetrics } from './_types/blog';

// --- 상수 ---

const TIMEOUTS = {
  search: 60_000,
  scrape: 120_000,
  generate: 300_000,
  save: 30_000,
  keyword: 300_000,
  selection: 120_000,
};
const BATCH_DELAY_MS = 3_000;
const SELECT_COUNT = 10;
const EXISTING_POSTS_LIMIT = 150;
const QUALITY_MIN_SCORE = 60;
export const DAILY_POST_COUNT = 7;

// --- 타입 ---

type DraftSuccess = {
  success: true;
  blogPost: BlogPostCreateInput;
  metrics: PipelineMetrics;
  qualityScore: number;
};

type DraftFailure = {
  success: false;
  error: string;
  metrics: PipelineMetrics;
};

type DraftResult = DraftSuccess | DraftFailure;

// --- 유틸 ---

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

// --- Phase 2: 단일 초안 생성 (저장 없이) ---

async function generateDraft(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review'): Promise<DraftResult> {
  const start = Date.now();
  const metrics: PipelineMetrics = { totalTime: 0, pagesScraped: 0 };

  try {
    const searchResults = await withTimeoutFallback(searchGoogle(keyword, 5), TIMEOUTS.search, [], 'Search');
    if (!searchResults.length) { /* no search results — AI generates from own knowledge */ }

    resetMetrics();
    const scraped = await withTimeoutFallback(scrapeSearchResults(searchResults), TIMEOUTS.scrape, [], 'Scrape');
    metrics.pagesScraped = scraped.length;
    getMetrics(); // finalize scraping metrics

    const analysis = analyzeCompetitors(scraped, keyword);
    const content = await withTimeout(generateBlogContent(keyword, analysis, type), TIMEOUTS.generate, 'AI');

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
    };

    metrics.totalTime = Date.now() - start;
    return { success: true, blogPost: post, metrics, qualityScore: content.qualityScore || 0 };
  } catch (e) {
    console.error(`[Draft] "${keyword}" 실패: ${err(e)}`);
    metrics.totalTime = Date.now() - start;
    return { success: false, error: err(e), metrics };
  }
}

// --- Phase 3: AI 선별 + 중복 검증 ---

async function selectTopPosts(drafts: DraftSuccess[], count: number): Promise<DraftSuccess[]> {
  if (drafts.length === 0) return [];
  if (drafts.length <= count) return drafts;

  const supabase = getServerSupabaseClient();
  const { data: existingPosts, error: dbError } = await supabase
    .from('blog_posts')
    .select('title, target_keyword')
    .order('created_at', { ascending: false })
    .limit(EXISTING_POSTS_LIMIT);

  if (dbError) console.warn('[Selection] DB 조회 실패:', dbError.message);

  const existingList = (existingPosts || []).map(p => ({ title: p.title, keyword: p.target_keyword }));

  const summaries = drafts.map((d, i) => ({
    index: i,
    title: d.blogPost.title,
    keyword: d.blogPost.target_keyword,
    metaTitle: d.blogPost.meta_title,
    metaDescription: d.blogPost.meta_description,
    faqCount: d.blogPost.faq_items?.length || 0,
    contentLength: d.blogPost.content?.length || 0,
    qualityScore: d.qualityScore,
    contentPreview: d.blogPost.content?.substring(0, 400),
  }));

  const prompt = `당신은 시니어 SEO 콘텐츠 에디터입니다.

## 임무
다음 ${drafts.length}개의 블로그 초안 중에서 최종 발행할 ${count}개를 선별해주세요.

## 절대 규칙 — 중복 제거 (최우선)
아래 "기존 발행된 블로그" 목록과 주제/키워드/관점이 겹치는 초안은 반드시 탈락시키세요.
- 같은 키워드를 다른 표현으로 쓴 것도 중복입니다 (예: "주식 초보 가이드" ↔ "주식 입문자 안내")
- 같은 주제를 다른 각도로 쓴 것도 중복입니다 (예: "ETF 추천 2026" ↔ "올해 ETF 투자 전략")
- 초안끼리 주제가 겹치는 경우, 품질이 더 높은 1개만 남기세요

## 기존 발행된 블로그 (최근 ${existingList.length}개)
${JSON.stringify(existingList.map(p => `${p.keyword} — ${p.title}`).slice(0, 100), null, 2)}

## 선별 기준 (중복 아닌 것들 중에서)
1. SEO 최적화 (키워드 적절성, 메타 태그 품질)
2. 콘텐츠 깊이 (길이, 구조, FAQ)
3. 주제 다양성 (선별된 ${count}개 내에서도 주제가 최대한 다양)
4. 독자 가치 (실용적 정보, 차별화된 관점)

## 초안 목록
${JSON.stringify(summaries, null, 2)}

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만:
{"selected": [0, 3, 5], "rejected_duplicates": [1, 4]}`;

  try {
    const response = await withTimeout(
      generateText({ prompt, config: { temperature: 0.3 } }),
      TIMEOUTS.selection,
      'Selection',
    );
    const cleaned = response.replace(/```json?\s*/gi, '').replace(/```/gi, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    const obj = parsed as { selected?: number[]; rejected_duplicates?: number[] };
    const indices: number[] = Array.isArray(obj.selected)
      ? obj.selected
      : (Array.isArray(parsed) ? parsed as number[] : []);

    const selected = indices
      .filter(i => typeof i === 'number' && i >= 0 && i < drafts.length)
      .slice(0, count)
      .map(i => drafts[i]);

    if (selected.length > 0) return selected;
    throw new Error('AI가 유효한 인덱스를 반환하지 않음');
  } catch (e) {
    console.warn(`[Selection] AI 선별 실패: ${err(e)} — 품질 점수 기준으로 폴백`);
    return [...drafts]
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, count);
  }
}

// --- Phase 4: 저장 & 발행 ---

async function saveAndPublishPosts(posts: DraftSuccess[]): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (const draft of posts) {
    try {
      draft.blogPost.status = 'published';
      const saved = await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
      await publishBlogPost(saved.slug).catch(e => console.warn('[Pipeline] publish 실패:', err(e)));
      await notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${saved.slug}`,
        'https://stockmatrix.co.kr/sitemap.xml',
      ]).catch(e => console.warn('[Pipeline] 인덱싱 알림 실패:', err(e)));

      results.push({ success: true, blogPost: draft.blogPost, metrics: draft.metrics });
    } catch (e) {
      console.error(`[Pipeline] 저장 실패 "${draft.blogPost.title}": ${err(e)}`);
      results.push({ success: false, error: err(e), metrics: draft.metrics });
    }
  }

  return results;
}

// --- 단일 포스트 생성 (하위 호환) ---

export async function generateBlogPost(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide', publish = false): Promise<PipelineResult> {
  console.log(`[Pipeline] "${keyword}" (${type})`);

  const draft = await generateDraft(keyword, type);
  if (!draft.success) return { success: false, error: draft.error, metrics: draft.metrics };

  if (publish) {
    draft.blogPost.status = 'published';
    try {
      const saved = await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
      await publishBlogPost(saved.slug).catch(e => console.warn('[Pipeline] publish 실패:', err(e)));
      await notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${saved.slug}`,
        'https://stockmatrix.co.kr/sitemap.xml',
      ]).catch(e => console.warn('[Pipeline] 인덱싱 알림 실패:', err(e)));
    } catch (e) {
      console.error(`[Pipeline] 저장 실패: ${err(e)}`);
      return { success: false, error: err(e), metrics: draft.metrics };
    }
  } else {
    try {
      await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
    } catch (e) {
      console.error(`[Pipeline] 저장 실패: ${err(e)}`);
      return { success: false, error: err(e), metrics: draft.metrics };
    }
  }

  return { success: true, blogPost: draft.blogPost, metrics: draft.metrics };
}

// --- 메인 엔트리: 4-Phase 파이프라인 ---

export async function generateWithDynamicKeywords(options: { publish?: boolean; count?: number } = {}): Promise<PipelineResult[]> {
  const { publish = false, count = DAILY_POST_COUNT } = options;

  console.log(`[Pipeline] 4-Phase 블로그 파이프라인 시작 (목표: ${count}개)`);

  try {
    // ━━━ Phase 1: 키워드 생성 ━━━
    console.log(`[Pipeline] Phase 1: AI 키워드 생성 (${count}개)`);

    const kwResult = await withTimeoutFallback(
      generateKeywords(count),
      TIMEOUTS.keyword,
      { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' },
      'Keyword',
    );

    if (!kwResult.success || !kwResult.keywords.length) {
      console.error(`[Pipeline] Phase 1 실패: ${kwResult.error || '키워드 없음'}`);
      return [];
    }
    console.log(`[Pipeline] Phase 1 완료: ${kwResult.keywords.length}개 키워드`);

    // ━━━ Phase 2: 초안 생성 (저장 없이) ━━━
    console.log(`[Pipeline] Phase 2: ${kwResult.keywords.length}개 초안 생성`);

    const drafts: DraftResult[] = [];
    for (let i = 0; i < kwResult.keywords.length; i++) {
      const kw = kwResult.keywords[i];
      const draft = await generateDraft(kw.keyword, kw.contentType);
      drafts.push(draft);

      if (i < kwResult.keywords.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    await closeBrowser().catch(() => {});

    const successfulDrafts = drafts.filter((d): d is DraftSuccess => d.success);
    console.log(`[Pipeline] Phase 2 완료: ${successfulDrafts.length}/${drafts.length} 성공`);

    if (successfulDrafts.length === 0) return [];

    // 품질 미달 필터
    const qualityDrafts = successfulDrafts.filter(d => d.qualityScore >= QUALITY_MIN_SCORE);
    // quality filter applied silently
    if (qualityDrafts.length === 0) {
      console.warn('[Pipeline] 품질 기준 통과 초안 없음 — 전체 초안으로 진행');
    }
    const draftsForSelection = qualityDrafts.length > 0 ? qualityDrafts : successfulDrafts;

    // ━━━ Phase 3: AI 선별 + 중복 검증 ━━━
    const selectCount = Math.min(SELECT_COUNT, draftsForSelection.length);
    console.log(`[Pipeline] Phase 3: AI 선별 + 중복 검증 — ${draftsForSelection.length}개 → 최대 ${selectCount}개`);

    const selected = await selectTopPosts(draftsForSelection, selectCount);
    console.log(`[Pipeline] Phase 3 완료: ${selected.length}개 선별`);

    if (!publish) {
      const results: PipelineResult[] = [];
      for (const draft of selected) {
        try {
          await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
          results.push({ success: true, blogPost: draft.blogPost, metrics: draft.metrics });
        } catch (e) {
          results.push({ success: false, error: err(e), metrics: draft.metrics });
        }
      }
      return results;
    }

    // ━━━ Phase 4: 저장 & 발행 ━━━
    console.log(`[Pipeline] Phase 4: ${selected.length}개 저장 & 발행`);

    const published = await saveAndPublishPosts(selected);
    const ok = published.filter(r => r.success).length;

    console.log(`[Pipeline] 최종: ${ok}개 발행 / ${published.length - ok}개 실패`);

    return published;
  } catch (e) {
    console.error(`[Pipeline] ${err(e)}`);
    await closeBrowser().catch(() => {});
    return [];
  }
}
