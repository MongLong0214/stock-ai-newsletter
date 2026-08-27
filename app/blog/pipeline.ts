/**
 * 블로그 파이프라인 오케스트레이터 — 게이트 우선 설계
 *
 * Phase 1: AI 키워드 후보 → 결정적 게이트 3단 (전 기간 클러스터 차단 → 중복 → 네이버 실측 검색량)
 * Phase 2: 검색량 상위 DRAFT_LIMIT개만 초안 생성 (SERP 근거 필수 → 생성 → 윤문 필수 → YMYL 게이트)
 * Phase 3: 게이트 통과분 중 검색량 상위 MAX_DAILY_PUBLISH개 발행, 나머지는 draft 보관
 *
 * 설계 원칙: 발행량은 상한이지 할당량이 아니다. 게이트를 통과한 글이 2개면 2개만
 * 발행한다. 이전 구조는 7개를 채우기 위해 게이트가 실패할 때마다 게이트를 껐다
 * (품질 미달 → 전체 진행, 윤문 실패 → AI 문체 그대로 발행, 검색 0건 → 모델 기억으로
 * 생성). 이전의 "Phase 3 AI 선별"은 생성량(7) ≤ 선별상한(10)이라 조기 리턴이 항상
 * 참인 죽은 코드였고, 카니벌리제이션(스테이블코인 21편·토스 11편)의 원인이었다.
 */

import { searchGoogle } from './_services/serp-api';
import { scrapeSearchResults, analyzeCompetitors, closeBrowser, getMetrics, resetMetrics } from './_services/web-scraper';
import { generateBlogContent, generateSlug, calculateQualityScore, validateContent } from './_services/content-generator';
import { humanizeGeneratedContent } from './_services/humanizer';
import { checkYmyl } from './_services/ymyl-gate';
import { countPublishedToday, findBlogPostStatus, saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import type { BlogPostCreateInput, PipelineResult, PipelineMetrics, CompetitorAnalysis, GeneratedContent } from './_types/blog';

// --- 상수 ---

const TIMEOUTS = {
  search: 60_000,
  scrape: 120_000,
  generate: 300_000,
  // 정상 윤문은 ~25초. 200초는 hang 시 초안 7개 누적으로 25분 스크립트 한도를 터뜨렸다(CI 실패 근본원인).
  // 60초면 정상은 통과(2.4배 여유)하고 hang은 빨리 끊어 fallback(원문 유지)한다.
  humanize: 60_000,
  save: 30_000,
  keyword: 300_000,
  selection: 120_000,
};

// 윤문 서킷브레이커: LLM 윤문 서비스가 저하되면(연속 타임아웃/에러) 남은 초안은 윤문을 생략해
// 초당 낭비를 막는다. run 단위 상태 — generateWithDynamicKeywords 시작 시 리셋.
const HUMANIZE_TRIP_THRESHOLD = 2;
let humanizeConsecutiveFailures = 0;
let humanizeDisabled = false;
function resetHumanizeGate() { humanizeConsecutiveFailures = 0; humanizeDisabled = false; }
function registerHumanizeFailure() {
  humanizeConsecutiveFailures += 1;
  if (humanizeConsecutiveFailures >= HUMANIZE_TRIP_THRESHOLD) {
    humanizeDisabled = true;
    console.warn(`[Humanize] 연속 ${HUMANIZE_TRIP_THRESHOLD}회 실패 — 이번 run 남은 초안은 생성 중단`);
  }
}
const BATCH_DELAY_MS = 3_000;
const QUALITY_MIN_SCORE = 60;

/**
 * 하루 발행 상한. 할당량이 아니다 — 게이트 통과분이 이보다 적으면 적게 발행한다.
 * 7에서 3으로 내린 근거: YMYL 금융 콘텐츠를 사람 검수 없이 자동 발행하는 구조에서
 * 하루 7편(연 2,555편)은 Google scaled content abuse 패턴과 구분되지 않고,
 * 실제로 1,306편 중 스테이블코인 21편·토스 11편의 카니벌을 만들었다.
 * 상한 초과 통과분은 버리지 않고 draft로 보관한다.
 */
export const MAX_DAILY_PUBLISH = 3;
/** Phase 2(SERP+스크래핑+생성+윤문) 진입 상한 — 25분 CI 예산 보호. 기존 7회보다 적다. */
const DRAFT_LIMIT = 5;
/** Phase 1 키워드 후보 수 — 게이트 탈락 여유분 */
const KEYWORD_CANDIDATE_COUNT = 10;

/** @deprecated MAX_DAILY_PUBLISH로 대체. 기존 호출부 호환용. */
export const DAILY_POST_COUNT = MAX_DAILY_PUBLISH;

// --- 타입 ---

type DraftSuccess = {
  success: true;
  blogPost: BlogPostCreateInput;
  metrics: PipelineMetrics;
  qualityScore: number;
  /** 네이버 실측 월간 검색량 — 발행 우선순위 정렬 기준 */
  searchVolume?: number;
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
  try {
    return await withTimeout(p, ms, label);
  } catch (e) {
    // 예전에는 전부 "타임아웃"으로 찍었다. SerpAPI 401도 타임아웃으로 보고돼
    // 인증 문제를 며칠씩 놓쳤다 — 실제 사유를 남긴다.
    console.warn(`[Pipeline] ${label} 실패 — fallback 사용: ${err(e)}`);
    return fallback;
  }
}

/**
 * 저장 + 타임아웃 화해.
 *
 * 타임아웃은 요청을 취소하지 못하므로 "실패"가 곧 "저장 안 됨"이 아니다. 실제 행을
 * 조회해 커밋됐으면 성공으로 판정한다 — 그러지 않으면 재실행이 같은 글을 또 쓴다.
 */
async function saveWithReconcile(post: BlogPostCreateInput): Promise<void> {
  const startedAt = Date.now();
  try {
    await withTimeout(saveBlogPost(post), TIMEOUTS.save, 'DB');
  } catch (e) {
    // 타임아웃일 때만 화해한다. 제약조건 위반 같은 진짜 실패까지 "행이 있으니 성공"으로
    // 바꾸면, 예전 draft 행을 이번 글로 착각해 그대로 공개하게 된다.
    if (!err(e).includes('타임아웃')) throw e;

    const row = await findBlogPostStatus(post.slug).catch(() => null);
    if (!row || row.title !== post.title) throw e;

    // 제목만 보면 같은 날 같은 제목으로 만들어진 **이전** 행을 이번 저장으로 착각한다.
    // updated_at이 이번 시도 이후여야 실제로 커밋된 것이다(시계 오차 5초 여유).
    const updatedAt = Date.parse(row.updated_at ?? '');
    if (!Number.isFinite(updatedAt) || updatedAt < startedAt - 5_000) throw e;

    console.warn(`[Pipeline] 저장 타임아웃이었으나 DB에 커밋됨 (${post.slug}, status=${row.status})`);
  }
}

/**
 * 윤문본을 채택할지 결정하고 품질 점수를 실제 본문 기준으로 다시 매긴다
 *
 * 윤문은 부가 개선이므로 글의 발행 자격을 깎아선 안 된다. 점수가 발행 하한 아래로
 * 떨어지면 원문으로 되돌린다 — 여기서 되돌리지 않으면 Phase 2의 품질 필터가
 * 글 자체를 버린다.
 */
function resolveHumanized(
  original: GeneratedContent,
  humanized: GeneratedContent,
  keyword: string,
  analysis: CompetitorAnalysis
): GeneratedContent {
  if (humanized === original) return original;

  const before = original.qualityScore ?? 0;
  const after = calculateQualityScore(humanized, keyword, analysis);

  if (after < QUALITY_MIN_SCORE && before >= QUALITY_MIN_SCORE) {
    // 이전에는 원문(AI 문체)으로 되돌려 발행했다 — "윤문 안 된 글 발행 금지" 불변과 모순.
    // 윤문이 품질을 임계 밑으로 떨어뜨렸으면 그 글은 버린다.
    throw new Error(`윤문 후 품질 미달 (${before} → ${after} < ${QUALITY_MIN_SCORE}) — 발행하지 않는다`);
  }

  if (after !== before) console.log(`[Humanize] 품질 점수 갱신 ${before} → ${after}`);

  return { ...humanized, qualityScore: after };
}

// --- Phase 2: 단일 초안 생성 (저장 없이) ---

async function generateDraft(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review'): Promise<DraftResult> {
  const start = Date.now();
  const metrics: PipelineMetrics = { totalTime: 0, pagesScraped: 0 };

  try {
    // 브레이커가 열렸으면 SERP·스크래핑·생성 비용을 쓰기 전에 중단한다
    if (humanizeDisabled) {
      throw new Error('윤문 서킷브레이커 열림 — 남은 초안 생성 중단');
    }

    const searchResults = await withTimeoutFallback(searchGoogle(keyword, 5), TIMEOUTS.search, [], 'Search');
    // 근거 수집 실패 = 초안 보류. 검색 결과 없이 진행하면 금융 사실을 모델 기억으로 쓴다 —
    // 출처 없는 통계("정부 통계에 따르면 200% 급증")가 발행된 실제 경로였다.
    if (!searchResults.length) {
      throw new Error('검색 결과 0건 — 근거 없이 YMYL 콘텐츠를 생성하지 않는다');
    }

    resetMetrics();
    const scraped = await withTimeoutFallback(scrapeSearchResults(searchResults), TIMEOUTS.scrape, [], 'Scrape');
    metrics.pagesScraped = scraped.length;
    getMetrics(); // finalize scraping metrics

    if (!scraped.length) {
      throw new Error('스크래핑 0건 — 근거 문서 없이 진행하지 않는다');
    }

    const analysis = analyzeCompetitors(scraped, keyword);
    const generated = await withTimeout(generateBlogContent(keyword, analysis, type), TIMEOUTS.generate, 'AI');

    // 윤문은 필수 게이트다. 실패는 발행 금지, 의도적 스킵(킬스위치)만 원문 통과.
    let outcome;
    try {
      outcome = await withTimeout(humanizeGeneratedContent(generated, keyword), TIMEOUTS.humanize, 'Humanize');
    } catch (e) {
      registerHumanizeFailure();
      throw new Error(`윤문 실패(${err(e)}) — 윤문 안 된 글은 발행하지 않는다`);
    }

    // humanizeText는 내부 에러·가드 반려를 흡수하고 원문을 돌려주므로(accepted=false),
    // 여기서 명시적으로 실패 처리해야 서킷브레이커가 실제 실패를 센다.
    if (!outcome.accepted && !outcome.skipped) {
      registerHumanizeFailure();
      throw new Error('윤문 미채택(반려/에러) — 윤문 안 된 글은 발행하지 않는다');
    }
    humanizeConsecutiveFailures = 0;

    // skipped(킬스위치·짧은 본문)면 원문으로 진행 — 운영자의 명시적 선택이다
    const content = outcome.skipped
      ? generated
      : resolveHumanized(generated, outcome.content, keyword, analysis);

    // 하드 게이트는 생성 직후에만 돌았다. 윤문이 본문을 20~30% 줄이므로 2,000자 하한을
    // 통과했던 글이 윤문 뒤 1,400자가 되어도 아무도 다시 보지 않았다. 최종본으로 재검사한다.
    validateContent(content, keyword);

    // YMYL 결정적 게이트 — 모호 출처·투자 권유 단정·브랜드 남용·유령 종목.
    // 위반 시 재생성하지 않고 그 슬롯을 비운다.
    const violations = await checkYmyl(
      {
        body: content.content,
        description: content.description,
        faqItems: content.faqItems,
        metaDescription: content.metaDescription,
        metaTitle: content.metaTitle,
        title: content.title,
      },
      keyword,
    );
    if (violations.length > 0) {
      throw new Error(`YMYL 게이트 위반: ${violations.map((v) => `[${v.rule}] ${v.detail}`).join(' / ')}`);
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

// --- Phase 3: 저장 & 발행 ---

async function saveAndPublishPosts(posts: DraftSuccess[]): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (const draft of posts) {
    try {
      // 상한을 한 번만 읽으면 로컬 실행과 Actions 실행이 겹칠 때 둘 다 0건을 읽고 각각 발행한다.
      // 원자적 예약(RPC·트랜잭션)이 없는 동안은 발행 직전 재확인으로 창을 좁힌다.
      const already = await countPublishedToday();
      if (already >= MAX_DAILY_PUBLISH) {
        const message = `하루 상한 도달 (${already}/${MAX_DAILY_PUBLISH}) — 남은 글은 발행하지 않는다`;
        console.warn(`[Pipeline] ${message}`);
        results.push({ success: false, error: message, metrics: draft.metrics });
        continue;
      }

      draft.blogPost.status = 'published';
      await saveWithReconcile(draft.blogPost);
      const saved = draft.blogPost;
      // Google Indexing API 호출은 제거 — 공식적으로 JobPosting/BroadcastEvent 전용이라
      // 일반 블로그 URL·sitemap 전송은 지원 대상이 아니다. 색인은 sitemap이 담당하고
      // Bing·네이버 재크롤은 publishBlogPost 안의 IndexNow가 처리한다.
      await publishBlogPost(saved.slug).catch(e => console.warn('[Pipeline] publish 실패:', err(e)));

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
      await saveWithReconcile(draft.blogPost);
      const saved = draft.blogPost;
      await publishBlogPost(saved.slug).catch(e => console.warn('[Pipeline] publish 실패:', err(e)));
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
  resetHumanizeGate();

  try {
    // ━━━ Phase 1: 키워드 후보 생성 + 게이트 ━━━
    // 발행 상한(count)이 아니라 후보 수를 요청한다 — 클러스터·중복·검색량 게이트가
    // 걸러낸 뒤에도 DRAFT_LIMIT를 채울 여유가 있어야 한다.
    console.log(`[Pipeline] Phase 1: AI 키워드 후보 ${KEYWORD_CANDIDATE_COUNT}개 생성 (발행 상한 ${Math.min(count, MAX_DAILY_PUBLISH)}개)`);

    const kwResult = await withTimeoutFallback(
      generateKeywords(KEYWORD_CANDIDATE_COUNT),
      TIMEOUTS.keyword,
      { success: false, keywords: [], totalGenerated: 0, totalFiltered: 0, error: 'timeout' },
      'Keyword',
    );

    if (!kwResult.success || !kwResult.keywords.length) {
      console.error(`[Pipeline] Phase 1 실패: ${kwResult.error || '키워드 없음'}`);
      return [];
    }

    // 실측 검색량(게이트에서 estimatedSearchVolume에 기록됨) 내림차순으로
    // DRAFT_LIMIT개만 Phase 2에 진입 — 초안 1개가 수 분(SERP+스크래핑+생성+윤문)이므로
    // 여기서 줄이는 것이 25분 CI 예산과 비용을 지킨다.
    const drafting = [...kwResult.keywords]
      .sort((a, b) => (b.estimatedSearchVolume ?? 0) - (a.estimatedSearchVolume ?? 0))
      .slice(0, DRAFT_LIMIT);
    console.log(`[Pipeline] Phase 1 완료: 게이트 통과 ${kwResult.keywords.length}개 → 초안 대상 ${drafting.length}개`);

    // ━━━ Phase 2: 초안 생성 (근거·윤문·YMYL 게이트 포함, 저장 없이) ━━━
    console.log(`[Pipeline] Phase 2: ${drafting.length}개 초안 생성`);

    const drafts: DraftResult[] = [];
    for (let i = 0; i < drafting.length; i++) {
      const kw = drafting[i];
      const draft = await generateDraft(kw.keyword, kw.contentType);
      if (draft.success) draft.searchVolume = kw.estimatedSearchVolume ?? 0;
      drafts.push(draft);

      if (i < drafting.length - 1) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    await closeBrowser().catch(() => {});

    const successfulDrafts = drafts.filter((d): d is DraftSuccess => d.success);
    console.log(`[Pipeline] Phase 2 완료: ${successfulDrafts.length}/${drafts.length} 게이트 통과`);
    if (successfulDrafts.length === 0) {
      console.warn('[Pipeline] 게이트 통과 초안 없음 — 오늘은 발행하지 않는다 (할당량을 채우기 위해 게이트를 끄지 않는다)');
      return [];
    }

    // ━━━ Phase 3: 저장 & 발행 — 검색량 상위 상한만 발행, 초과분은 draft 보관 ━━━
    const ranked = [...successfulDrafts].sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0));
    // 상한은 하루 단위다. 이번 실행분만 세면 재실행·수동 실행이 그대로 누적 발행된다.
    const publishedToday = publish ? await countPublishedToday() : 0;
    const remaining = Math.max(0, MAX_DAILY_PUBLISH - publishedToday);
    if (publish && remaining === 0) {
      console.warn(`[Pipeline] 오늘 이미 ${publishedToday}편 발행 — 상한 ${MAX_DAILY_PUBLISH} 도달, 전부 draft 보관`);
    }
    const limit = Math.min(count, remaining);
    const toPublish = publish ? ranked.slice(0, limit) : [];
    const toDraft = publish ? ranked.slice(limit) : ranked;

    const results: PipelineResult[] = [];
    for (const draft of toDraft) {
      try {
        await saveWithReconcile(draft.blogPost);
        results.push({ success: true, blogPost: draft.blogPost, metrics: draft.metrics });
      } catch (e) {
        results.push({ success: false, error: err(e), metrics: draft.metrics });
      }
    }

    if (toPublish.length > 0) {
      console.log(`[Pipeline] Phase 3: ${toPublish.length}개 발행 (상한 ${limit}), ${toDraft.length}개 draft 보관`);
      results.push(...await saveAndPublishPosts(toPublish));
    }

    const ok = results.filter(r => r.success).length;
    console.log(`[Pipeline] 최종: ${ok}/${results.length} 성공`);
    return results;
  } catch (e) {
    console.error(`[Pipeline] ${err(e)}`);
    await closeBrowser().catch(() => {});
    return [];
  }
}
