/**
 * 블로그 파이프라인 오케스트레이터 — 게이트 우선 설계
 *
 * Phase 1: AI 키워드 후보 → 결정적 게이트 3단 (전 기간 클러스터 차단 → 중복 → 네이버 실측 검색량)
 * Phase 2: 검색량 순으로 초안을 시도해 발행 상한만큼 통과하면 멈춘다 (SERP 근거 필수 → 생성 → 윤문 필수 → YMYL 게이트)
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
import { blogPostExists, countPublishedToday, findBlogPostStatus, saveBlogPost, publishBlogPost } from './_services/blog-repository';
import { generateKeywords } from './_services/keyword-generator';
import { alignMarketToBody, buildMarketContext, formatMarketDataForPrompt } from './_services/market-data';
import { createPostVisuals, type PostVisualsResult } from './_services/post-visuals';
import { removeBlogImages } from './_services/image-storage';
import { CONTENT_CONFIG, HUMANIZE_CONFIG, KEYWORD_CONFIG, PIPELINE_CONFIG, VISUAL_CONFIG } from './_config/pipeline-config';
import type { BlogPostCreateInput, PipelineResult, PipelineMetrics, CompetitorAnalysis, GeneratedContent } from './_types/blog';

// --- 상수 ---

const TIMEOUTS = {
  search: 60_000,
  // 배치 안쪽 예산(LIMITS.BATCH_BUDGET_MS=90초)이 먼저 끊고 부분 성공분을 돌려주도록
  // 바깥은 확실히 위에 둔다. 바깥이 먼저 터지면 fallback []가 되어 성공한 문서까지 버려진다.
  scrape: 180_000,
  // 3회 × 600초 + backoff 최대 7.8초를 기다려 안쪽 요청 취소·오류가 먼저 전달되게 한다.
  generate: CONTENT_CONFIG.timeout * PIPELINE_CONFIG.retryAttempts + 15_000,
  // 안쪽 AbortSignal 취소가 먼저 실행돼 실제 실패 사유가 남도록 15초 여유를 둔다.
  humanize: HUMANIZE_CONFIG.timeout + 15_000,
  save: 30_000,
  marketData: VISUAL_CONFIG.marketDataTimeout,
  // 안쪽 예산(KEYWORD_CONFIG.budget)이 먼저 끝나 모은 키워드를 돌려주도록 DB 조회·검색량 게이트 여유를 둔다.
  keyword: KEYWORD_CONFIG.budget + 120_000,
  selection: 120_000,
};

/**
 * 시각자료는 run 시작 후 이 시각까지만 쓴다. 스크립트 한도 75분(scripts/generate-blog-post.ts) 전에
 * YMYL 재검사·저장·발행이 끝나야 한다 — 시각자료 때문에 글 자체를 잃으면 안 된다.
 */
const VISUALS_RUN_CUTOFF_MS = 68 * 60_000;
/** 이보다 남은 시간이 적으면 시각자료를 시작하지 않는다 */
const VISUALS_MIN_BUDGET_MS = 60_000;
let runStartedAt = Date.now();

// 윤문 서킷브레이커: LLM 윤문 서비스가 저하되면(연속 타임아웃/에러) 남은 초안은 윤문을 생략해
// 초당 낭비를 막는다. run 단위 상태 — generateWithDynamicKeywords 시작 시 리셋.
// 시스템 장애만 센다. 이 브레이커가 개별 요청의 타임아웃을 줄이지는 않는다.
const HUMANIZE_TRIP_THRESHOLD = 3;
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
 * 2026-08-28 GSC 실측은 사이트맵 1,524 URL 중 색인 240 / 색인 안 됨 약 1,960이며,
 * "크롤링됨-미색인" 711 + "발견됨-미색인" 529 = 1,240이 블로그 글 1,273편과 거의
 * 일치했다. GA4 28일 상위 유입 10개 중 개별 블로그 글은 1개(4세션)뿐이어서 양산은
 * 트래픽을 만들지 못하고 크롤링 예산만 소모했다. 파이프라인은 유지하고 발행량만 줄인다.
 * 상한 초과 통과분은 버리지 않고 draft로 보관한다.
 */
export const MAX_DAILY_PUBLISH = 1;
/**
 * Phase 2 새 초안 시도는 run 시작 후 이 시각까지만 시작한다.
 *
 * 예전에는 검색량 1위 키워드 1개만 시도했다(DRAFT_LIMIT=1). 초안 하나가 검색 0건·스크래핑
 * 0건·윤문 반려·YMYL 위반 중 하나에만 걸려도 그날 발행이 0건이 됐다 — 2026-09-01~11-10
 * 40회 중 18회. 그래서 게이트는 그대로 두고, 상한만큼 통과할 때까지 다음 키워드로 넘어간다.
 *
 * 실측 소요: 검색·스크래핑 실패는 1~3분, 생성 207~259초 + 윤문 97~162초 = 초안 6~8분.
 * 40분에 시작한 시도는 생성 1회 재시도(+10분)를 겪어도 시각자료 마감(68분) 전에 끝난다.
 * 생성 3회 전부 타임아웃 같은 최악(약 40분)은 스크립트 한도(75분)에 걸리지만, 그 시도까지
 * 왔다는 것은 앞선 시도가 모두 실패했다는 뜻이라 잃는 글이 없다.
 */
export const DRAFT_START_CUTOFF_MS = 40 * 60_000;
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
  /** 본문에 실린 스토리지 이미지 — 저장 실패 시 정리한다 */
  imagePaths: readonly string[];
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

/**
 * 저장되지 않은 초안의 이미지를 지운다 — 스토리지에 고아 파일을 남기지 않는다.
 * 행이 있거나 존재 여부를 모르면 지우지 않는다(커밋된 글의 이미지가 깨지는 쪽이 더 나쁘다).
 * 저장이 타임아웃으로 끝났으면 취소되지 않은 upsert가 뒤늦게 커밋될 수 있으므로 지우지 않는다.
 */
async function discardImages(draft: { imagePaths: readonly string[]; blogPost?: { slug: string } }, cause?: unknown): Promise<void> {
  if (draft.imagePaths.length === 0) return;
  if (cause !== undefined && err(cause).includes('타임아웃')) {
    console.warn(`[Pipeline] 저장 타임아웃 — 늦은 커밋 가능성 때문에 이미지 ${draft.imagePaths.length}개를 남긴다`);
    return;
  }
  try {
    if (draft.blogPost && await blogPostExists(draft.blogPost.slug)) return;
    await removeBlogImages(draft.imagePaths);
  } catch (e) {
    console.warn(`[Pipeline] 이미지 정리 생략: ${err(e)}`);
  }
}

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

/** YMYL 게이트 검사 표면 */
function ymylSurface(content: GeneratedContent) {
  return {
    body: content.content,
    description: content.description,
    faqItems: content.faqItems,
    metaDescription: content.metaDescription,
    metaTitle: content.metaTitle,
    title: content.title,
  };
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
    // 키워드가 가리키는 종목·테마의 실측 시세. 본문 수치의 근거이자 발행 시 차트·표의 원천이다.
    // 실패해도 글은 시세 없이 진행한다(시각자료는 게이트가 아니다).
    const market = await withTimeoutFallback(
      buildMarketContext(keyword, Date.now() + TIMEOUTS.marketData),
      TIMEOUTS.marketData + 5_000,
      null,
      'MarketData',
    );
    const generated = await withTimeout(
      generateBlogContent(keyword, analysis, type, formatMarketDataForPrompt(market)),
      TIMEOUTS.generate,
      'AI',
    );

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
      // 서킷브레이커는 **시스템 장애**만 센다.
      //
      // 콘텐츠 사유 반려(수치·헤딩·AI 티)는 그 글 하나의 문제다. 이것까지 세면
      // 연속 2건 반려가 남은 초안 생성을 전부 막아 그날 발행이 0건이 된다
      // (실측: 타임아웃 1건 + 헤딩 변경 1건에 남은 3편이 생성조차 되지 않았다).
      // 브레이커의 목적은 윤문 API가 죽었을 때 GPT 비용을 끊는 것이다.
      if (outcome.status === 'error') registerHumanizeFailure();
      throw new Error(`윤문 미채택(${outcome.status}) — 윤문 안 된 글은 발행하지 않는다`);
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
    const violations = await checkYmyl(ymylSurface(content), keyword);
    if (violations.length > 0) {
      throw new Error(`YMYL 게이트 위반: ${violations.map((v) => `[${v.rule}] ${v.detail}`).join(' / ')}`);
    }

    // 시각자료는 모든 게이트를 통과한 글에만 만든다 — 반려될 초안에 이미지 비용을 쓰지 않는다.
    // 스크립트 한도(75분) 안에서 저장·발행할 시간을 남기도록 run 마감에 맞춰 예산을 줄인다.
    const slug = generateSlug(content.title, keyword);
    const visualsBudget = Math.min(VISUAL_CONFIG.budget, runStartedAt + VISUALS_RUN_CUTOFF_MS - Date.now());
    const noVisuals: PostVisualsResult = { markdown: content.content, uploadedPaths: [], summary: { chart: false, cover: false, sections: 0 } };
    let visuals = noVisuals;
    if (visualsBudget < VISUALS_MIN_BUDGET_MS) {
      console.warn(`[Visuals] run 마감 임박 — 시각자료 생략 (남은 ${Math.round(visualsBudget / 1000)}초)`);
    } else {
      visuals = await withTimeoutFallback(
        createPostVisuals({
          slug,
          keyword,
          title: content.title,
          markdown: content.content,
          // 본문이 다루지 않는 테마 종목·본문과 어긋나는 수치는 싣지 않는다
          market: alignMarketToBody(market, content.content),
          budgetMs: visualsBudget,
        }),
        // 안쪽 마감(+유예 20초)이 먼저 끝나 끝난 것만 싣도록 여유를 둔다
        visualsBudget + 60_000,
        noVisuals,
        'Visuals',
      );
    }
    let body = visuals.markdown;
    let imagePaths = visuals.uploadedPaths;
    if (body !== content.content) {
      // 끼워 넣은 데이터 섹션·캡션도 같은 YMYL 규칙을 지켜야 한다. 어기면 시각자료만 버리고 글은 살린다.
      const visualViolations = await checkYmyl({ ...ymylSurface(content), body }, keyword);
      if (visualViolations.length > 0) {
        console.warn(`[Visuals] YMYL 위반으로 시각자료 제외: ${visualViolations.map((v) => `[${v.rule}] ${v.detail}`).join(' / ')}`);
        await discardImages({ imagePaths });
        body = content.content;
        imagePaths = [];
      }
    }

    const post: BlogPostCreateInput = {
      slug,
      title: content.title,
      description: content.description,
      content: body,
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
    return { success: true, blogPost: post, metrics, qualityScore: content.qualityScore || 0, imagePaths };
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
        await discardImages(draft);
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
      await discardImages(draft, e);
      results.push({ success: false, error: err(e), metrics: draft.metrics });
    }
  }

  return results;
}

// --- 단일 포스트 생성 (하위 호환) ---

export async function generateBlogPost(keyword: string, type: 'comparison' | 'guide' | 'listicle' | 'review' = 'guide', publish = false): Promise<PipelineResult> {
  console.log(`[Pipeline] "${keyword}" (${type})`);
  runStartedAt = Date.now();

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
      await discardImages(draft, e);
      return { success: false, error: err(e), metrics: draft.metrics };
    }
  } else {
    try {
      await withTimeout(saveBlogPost(draft.blogPost), TIMEOUTS.save, 'DB');
    } catch (e) {
      console.error(`[Pipeline] 저장 실패: ${err(e)}`);
      await discardImages(draft, e);
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
  runStartedAt = Date.now();
  // Phase 3 도중 throw(예: 발행 수 조회 실패)로 빠져도 업로드한 이미지를 정리하기 위해 밖에 둔다
  let successfulDrafts: DraftSuccess[] = [];

  try {
    // ━━━ Phase 1: 키워드 후보 생성 + 게이트 ━━━
    // 발행 상한(count)이 아니라 후보 수를 요청한다 — 클러스터·중복·검색량 게이트가
    // 걸러낸 뒤에도 초안이 실패했을 때 넘어갈 다음 키워드가 남아 있어야 한다.
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

    // 실측 검색량(게이트에서 estimatedSearchVolume에 기록됨) 내림차순으로 시도한다.
    const candidates = [...kwResult.keywords]
      .sort((a, b) => (b.estimatedSearchVolume ?? 0) - (a.estimatedSearchVolume ?? 0));
    const needed = Math.min(count, MAX_DAILY_PUBLISH);
    console.log(`[Pipeline] Phase 1 완료: 게이트 통과 ${candidates.length}개 → 검색량 순으로 ${needed}개 통과까지 시도`);

    // ━━━ Phase 2: 초안 생성 (근거·윤문·YMYL 게이트 포함, 저장 없이) ━━━
    // 실패한 초안의 게이트는 끄지 않는다. 그 키워드를 버리고 다음 키워드로 넘어갈 뿐이다.
    console.log(`[Pipeline] Phase 2: 초안 생성 (통과 ${needed}개 또는 시작 마감 ${DRAFT_START_CUTOFF_MS / 60_000}분까지)`);

    const drafts: DraftResult[] = [];
    let passed = 0;
    for (const kw of candidates) {
      if (passed >= needed) break;
      if (humanizeDisabled) break;
      const elapsed = Date.now() - runStartedAt;
      if (elapsed > DRAFT_START_CUTOFF_MS) {
        console.warn(`[Pipeline] 초안 시작 마감 경과 (${Math.round(elapsed / 60_000)}분) — 남은 키워드는 시도하지 않는다`);
        break;
      }
      if (drafts.length > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));

      console.log(`[Pipeline] 초안 시도 ${drafts.length + 1}/${candidates.length}: "${kw.keyword}"`);
      const draft = await generateDraft(kw.keyword, kw.contentType);
      if (draft.success) {
        draft.searchVolume = kw.estimatedSearchVolume ?? 0;
        passed += 1;
      }
      drafts.push(draft);
    }

    await closeBrowser().catch(() => {});

    successfulDrafts = drafts.filter((d): d is DraftSuccess => d.success);
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
        await discardImages(draft, e);
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
    // 저장된 글의 이미지는 discardImages가 행 존재를 확인하고 남긴다
    for (const draft of successfulDrafts) await discardImages(draft);
    return [];
  }
}
