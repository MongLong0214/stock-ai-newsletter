/**
 * 4-Phase 블로그 파이프라인 오케스트레이터
 *
 * Phase 1: AI 키워드 생성 (Vertex AI Gemini + TLI 컨텍스트 + 롤링 윈도우 중복 제거)
 * Phase 2: 초안 생성 (SERP 검색 → 스크래핑 → AI 콘텐츠 생성, 저장 없이)
 * Phase 3: AI 선별 + 중복 검증 (기존 블로그 대비, 상위 N개 선택)
 * Phase 4: 저장 & 발행 + Google Indexing
 *
 * Fixes applied:
 * - AI-011: Source-backed citation gate — drafts must cite scraped sources
 * - COR-006: Fail closed when no draft meets quality+citation requirements
 * - COR-007: AbortController propagation (replaces Promise.race-only timeouts)
 * - COR-008: Single published state write (no duplicate saveBlogPost + second publish transition)
 */

import { searchGoogle } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug, calculateQualityScore } from './_services/content-generator';
import { humanizeGeneratedContent } from './_services/humanizer';
import { saveBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import { validateCitations } from './_services/citation-gate';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { generateText } from '@/lib/llm/gemini-client';
import { notifyGoogleIndexingBatch } from '@/lib/google-indexing';
import { z } from 'zod';
import { abortableSleep, runWithAbortTimeout } from './_utils/abort';
import { wrapUntrustedJson } from './_utils/prompt-escaping';
import type { BlogPostCreateInput, PipelineResult, PipelineMetrics, CompetitorAnalysis, GeneratedContent, ScrapedContent } from './_types/blog';

// --- 상수 ---

const TIMEOUTS = {
  search: 60_000,
  scrape: 120_000,
  generate: 300_000,
  humanize: 200_000,
  save: 30_000,
  keyword: 300_000,
  selection: 120_000,
};
const BATCH_DELAY_MS = 3_000;
const SELECT_COUNT = 10;
const EXISTING_POSTS_LIMIT = 150;
const QUALITY_MIN_SCORE = 60;
const selectionResponseSchema = z.object({
  selected: z.array(z.number().int().nonnegative()).max(SELECT_COUNT),
  rejected_duplicates: z.array(z.number().int().nonnegative()).optional(),
}).strict();
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

async function withAbortTimeoutFallback<R>(
  fn: (signal: AbortSignal) => Promise<R>,
  ms: number,
  fallback: R,
  label: string,
  parentSignal?: AbortSignal,
): Promise<R> {
  try {
    return await runWithAbortTimeout(fn, ms, label, parentSignal);
  } catch {
    console.warn(`[Pipeline] ${label} 타임아웃/실패 — fallback`);
    return fallback;
  }
}

// --- 유틸 ---

const err = (e: unknown) => e instanceof Error ? e.message : String(e);

/**
 * 윤문본을 채택할지 결정하고 품질 점수를 실제 본문 기준으로 다시 매긴다
 */
function resolveHumanized(
  original: GeneratedContent,
  humanized: GeneratedContent,
  keyword: string,
  analysis: CompetitorAnalysis
): GeneratedContent {
  if (humanized === original) return original;

  const citationCheck = validateCitations(humanized, analysis.scrapedContents);
  if (!citationCheck.passed) {
    console.warn(`[Humanize] 인용 근거 훼손 — 원문 유지: ${citationCheck.reason}`);
    return original;
  }

  const before = original.qualityScore ?? 0;
  const after = calculateQualityScore(humanized, keyword, analysis);

  if (after < QUALITY_MIN_SCORE && before >= QUALITY_MIN_SCORE) {
    console.warn(`[Humanize] 품질 점수 하락 (${before} → ${after} < ${QUALITY_MIN_SCORE}) — 원문 유지`);
    return original;
  }

  if (after !== before) console.log(`[Humanize] 품질 점수 갱신 ${before} → ${after}`);

  return { ...humanized, qualityScore: after };
}

// --- Phase 2: 단일 초안 생성 (저장 없이) ---

async function generateDraft(
  keyword: string,
  type: 'comparison' | 'guide' | 'listicle' | 'review',
  pipelineSignal?: AbortSignal,
): Promise<DraftResult> {
  const start = Date.now();
  const metrics: PipelineMetrics = { totalTime: 0, pagesScraped: 0 };

  try {
    // COR-007: AbortSignal propagated through search
    const searchResults = await withAbortTimeoutFallback(
      (signal) => searchGoogle(keyword, 5, signal),
      TIMEOUTS.search,
      [],
      'Search',
      pipelineSignal,
    );

    // AI-011: If no search results and no scraped content, fail (no source evidence)
    if (!searchResults.length) {
      return {
        success: false,
        error: '검색 결과 없음 — 스크래핑된 소스 없이 생성 불가 (AI-011: source evidence required)',
        metrics: { ...metrics, totalTime: Date.now() - start },
      };
    }

    resetMetrics();
    const scraped: ScrapedContent[] = await withAbortTimeoutFallback(
      (signal) => scrapeSearchResults(searchResults, signal),
      TIMEOUTS.scrape,
      [],
      'Scrape',
      pipelineSignal,
    );
    metrics.pagesScraped = scraped.length;
    getMetrics();

    // AI-011: Require at least some scraped evidence
    if (scraped.length < 2) {
      return {
        success: false,
        error: `독립적으로 스크래핑된 소스 부족 (${scraped.length}/2) — 모델 지식만으로 생성 불가 (AI-011)`,
        metrics: { ...metrics, totalTime: Date.now() - start },
      };
    }

    const analysis = analyzeCompetitors(scraped, keyword);

    // COR-007: Signal propagated through generation
    const generated = await runWithAbortTimeout(
      (signal) => generateBlogContent(keyword, analysis, type, signal),
      TIMEOUTS.generate,
      'AI',
      pipelineSignal,
    );

    // 윤문
    const humanized = await withAbortTimeoutFallback(
      (signal) => humanizeGeneratedContent(generated, keyword, signal),
      TIMEOUTS.humanize,
      generated,
      'Humanize',
      pipelineSignal,
    );

    const content = resolveHumanized(generated, humanized, keyword, analysis);

    // AI-011: Citation gate — verify inline citations tied to scraped sources
    const citationResult = validateCitations(content, scraped);
    if (!citationResult.passed) {
      console.warn(`[Draft] "${keyword}" 인용 검증 실패: ${citationResult.reason}`);
      return {
        success: false,
        error: `인용 검증 실패: ${citationResult.reason}`,
        metrics: { ...metrics, totalTime: Date.now() - start },
      };
    }

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

async function selectTopPosts(
  drafts: DraftSuccess[],
  count: number,
  pipelineSignal?: AbortSignal,
): Promise<DraftSuccess[]> {
  if (drafts.length === 0) return [];
  if (drafts.length <= count) return drafts;

  const supabase = getServerSupabaseClient();
  const { data: existingPosts, error: dbError } = await supabase
    .from('blog_posts')
    .select('title, target_keyword')
    .order('created_at', { ascending: false })
    .limit(EXISTING_POSTS_LIMIT);

  if (dbError) throw new Error(`Selection existing-post query failed: ${dbError.message}`);

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
${wrapUntrustedJson(
  existingList.map(p => `${p.keyword} — ${p.title}`).slice(0, 100),
  'existing-blog-metadata-json',
)}

## 선별 기준 (중복 아닌 것들 중에서)
1. SEO 최적화 (키워드 적절성, 메타 태그 품질)
2. 콘텐츠 깊이 (길이, 구조, FAQ)
3. 주제 다양성 (선별된 ${count}개 내에서도 주제가 최대한 다양)
4. 독자 가치 (실용적 정보, 차별화된 관점)

## 초안 목록
${wrapUntrustedJson(summaries, 'candidate-draft-metadata-json')}

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만:
{"selected": [0, 3, 5], "rejected_duplicates": [1, 4]}`;

  try {
    const response = await runWithAbortTimeout(
      (signal) => generateText({ prompt, config: { temperature: 0.3 }, signal }),
      TIMEOUTS.selection,
      'Selection',
      pipelineSignal,
    );
    const cleaned = response.replace(/```json?\s*/gi, '').replace(/```/gi, '').trim();
    const parsed = selectionResponseSchema.parse(JSON.parse(cleaned));
    const indices = [...new Set(parsed.selected)];

    const selected = indices
      .filter(i => typeof i === 'number' && i >= 0 && i < drafts.length)
      .slice(0, count)
      .map(i => drafts[i]);

    if (selected.length > 0) return selected;
    throw new Error('AI가 유효한 인덱스를 반환하지 않음');
  } catch (e) {
    console.warn(`[Selection] 선별/중복 검증 실패: ${err(e)} — 발행 후보 없음`);
    return [];
  }
}

// --- Phase 4: 저장 & 발행 (COR-008: single write, no duplicate second publish transition) ---

async function saveAndPublishPosts(
  posts: DraftSuccess[],
  pipelineSignal?: AbortSignal,
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (const draft of posts) {
    try {
      // COR-008: Set status to published ONCE in the save call.
      // No separate second publish transition call — saveBlogPost with status='published'
      // already sets published_at via the repository logic.
      draft.blogPost.status = 'published';
      draft.blogPost.published_at = new Date().toISOString();

      await runWithAbortTimeout(
        (stageSignal) => saveBlogPost(draft.blogPost, stageSignal),
        TIMEOUTS.save,
        'DB',
        pipelineSignal,
      );

      await notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${draft.blogPost.slug}`,
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

export async function generateBlogPost(
  keyword: string,
  type: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide',
  publish = false,
  signal?: AbortSignal,
): Promise<PipelineResult> {
  console.log(`[Pipeline] "${keyword}" (${type})`);

  const draft = await generateDraft(keyword, type, signal);
  if (!draft.success) return { success: false, error: draft.error, metrics: draft.metrics };

  if (publish) {
    // COR-008: Single write with published status
    draft.blogPost.status = 'published';
    draft.blogPost.published_at = new Date().toISOString();
    try {
      await runWithAbortTimeout((stageSignal) => saveBlogPost(draft.blogPost, stageSignal), TIMEOUTS.save, 'DB', signal);
      await notifyGoogleIndexingBatch([
        `https://stockmatrix.co.kr/blog/${draft.blogPost.slug}`,
        'https://stockmatrix.co.kr/sitemap.xml',
      ]).catch(e => console.warn('[Pipeline] 인덱싱 알림 실패:', err(e)));
    } catch (e) {
      console.error(`[Pipeline] 저장 실패: ${err(e)}`);
      return { success: false, error: err(e), metrics: draft.metrics };
    }
  } else {
    try {
      await runWithAbortTimeout((stageSignal) => saveBlogPost(draft.blogPost, stageSignal), TIMEOUTS.save, 'DB', signal);
    } catch (e) {
      console.error(`[Pipeline] 저장 실패: ${err(e)}`);
      return { success: false, error: err(e), metrics: draft.metrics };
    }
  }

  return { success: true, blogPost: draft.blogPost, metrics: draft.metrics };
}

// --- 메인 엔트리: 4-Phase 파이프라인 ---

export async function generateWithDynamicKeywords(options: { publish?: boolean; count?: number; signal?: AbortSignal } = {}): Promise<PipelineResult[]> {
  const { publish = false, count = DAILY_POST_COUNT, signal: parentSignal } = options;

  // COR-007: Create a pipeline-level AbortController
  const pipelineController = new AbortController();
  const pipelineSignal = pipelineController.signal;

  // Link parent signal to pipeline controller
  const onParentAbort = () => pipelineController.abort(parentSignal?.reason);
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  if (parentSignal?.aborted) pipelineController.abort(parentSignal.reason);

  console.log(`[Pipeline] 4-Phase 블로그 파이프라인 시작 (목표: ${count}개)`);

  try {
    // ━━━ Phase 1: 키워드 생성 ━━━
    console.log(`[Pipeline] Phase 1: AI 키워드 생성 (${count}개)`);

    const kwResult = await withAbortTimeoutFallback(
      (signal) => generateKeywords(count, signal),
      TIMEOUTS.keyword,
      { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' },
      'Keyword',
      pipelineSignal,
    );

    if (!kwResult.success || !kwResult.keywords.length) {
      console.error(`[Pipeline] Phase 1 실패: ${kwResult.error || '키워드 없음'}`);
      // COR-006: Fail closed — return empty with explicit error, not silent empty array
      return [{ success: false, error: `Phase 1 키워드 생성 실패: ${kwResult.error || '키워드 없음'}`, metrics: { totalTime: 0, pagesScraped: 0 } }];
    }
    console.log(`[Pipeline] Phase 1 완료: ${kwResult.keywords.length}개 키워드`);

    // ━━━ Phase 2: 초안 생성 (저장 없이) ━━━
    console.log(`[Pipeline] Phase 2: ${kwResult.keywords.length}개 초안 생성`);

    const drafts: DraftResult[] = [];
    for (let i = 0; i < kwResult.keywords.length; i++) {
      // Check abort before each draft
      if (pipelineSignal.aborted) break;

      const kw = kwResult.keywords[i];
      const draft = await generateDraft(kw.keyword, kw.contentType, pipelineSignal);
      drafts.push(draft);

      if (i < kwResult.keywords.length - 1) {
        await abortableSleep(BATCH_DELAY_MS, pipelineSignal).catch(() => {});
      }
    }

    await closeBrowser().catch(() => {});

    if (pipelineSignal.aborted) {
      return [{
        success: false,
        error: `파이프라인 중단: ${err(pipelineSignal.reason)}`,
        metrics: { totalTime: 0, pagesScraped: 0 },
      }];
    }

    const successfulDrafts = drafts.filter((d): d is DraftSuccess => d.success);
    console.log(`[Pipeline] Phase 2 완료: ${successfulDrafts.length}/${drafts.length} 성공`);

    // COR-006: Fail closed when no draft meets quality/citation requirements
    if (successfulDrafts.length === 0) {
      const failures = drafts.filter((d): d is DraftFailure => !d.success);
      const reasons = failures.map(f => f.error).slice(0, 3).join('; ');
      console.error(`[Pipeline] COR-006: 모든 초안 실패 — 발행 중단. 사유: ${reasons}`);
      return [{ success: false, error: `모든 초안이 품질/인용 요구사항을 충족하지 못함: ${reasons}`, metrics: { totalTime: 0, pagesScraped: 0 } }];
    }

    // 품질 미달 필터
    const qualityDrafts = successfulDrafts.filter(d => d.qualityScore >= QUALITY_MIN_SCORE);

    // COR-006: If no drafts pass quality filter, fail closed instead of falling back
    if (qualityDrafts.length === 0) {
      console.error('[Pipeline] COR-006: 품질 기준 통과 초안 없음 — 발행 중단 (fail closed)');
      return [{ success: false, error: '모든 초안이 품질 기준 미달 (fail closed)', metrics: { totalTime: 0, pagesScraped: 0 } }];
    }

    // ━━━ Phase 3: AI 선별 + 중복 검증 ━━━
    const selectCount = Math.min(SELECT_COUNT, qualityDrafts.length);
    console.log(`[Pipeline] Phase 3: AI 선별 + 중복 검증 — ${qualityDrafts.length}개 → 최대 ${selectCount}개`);

    const selected = await selectTopPosts(qualityDrafts, selectCount, pipelineSignal);
    console.log(`[Pipeline] Phase 3 완료: ${selected.length}개 선별`);

    // COR-006: If selection yields nothing, fail closed
    if (selected.length === 0) {
      console.error('[Pipeline] COR-006: 선별된 초안 없음 — 발행 중단');
      return [{ success: false, error: '선별 단계에서 적합한 초안 없음 (fail closed)', metrics: { totalTime: 0, pagesScraped: 0 } }];
    }

    if (!publish) {
      const results: PipelineResult[] = [];
      for (const draft of selected) {
        try {
          await runWithAbortTimeout((stageSignal) => saveBlogPost(draft.blogPost, stageSignal), TIMEOUTS.save, 'DB', pipelineSignal);
          results.push({ success: true, blogPost: draft.blogPost, metrics: draft.metrics });
        } catch (e) {
          results.push({ success: false, error: err(e), metrics: draft.metrics });
        }
      }
      return results;
    }

    // ━━━ Phase 4: 저장 & 발행 ━━━
    console.log(`[Pipeline] Phase 4: ${selected.length}개 저장 & 발행`);

    const published = await saveAndPublishPosts(selected, pipelineSignal);
    const ok = published.filter(r => r.success).length;

    // COR-006: If all publish attempts failed, that's a pipeline failure
    if (ok === 0) {
      console.error('[Pipeline] COR-006: 모든 발행 시도 실패');
      return published;
    }

    console.log(`[Pipeline] 최종: ${ok}개 발행 / ${published.length - ok}개 실패`);

    return published;
  } catch (e) {
    console.error(`[Pipeline] ${err(e)}`);
    await closeBrowser().catch(() => {});
    // COR-006: Return explicit failure, not empty array
    return [{ success: false, error: `파이프라인 치명적 오류: ${err(e)}`, metrics: { totalTime: 0, pagesScraped: 0 } }];
  } finally {
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
