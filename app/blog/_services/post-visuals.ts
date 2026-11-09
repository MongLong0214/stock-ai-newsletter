/**
 * 발행 직전 본문 시각자료 조립
 *
 * 1) 실측 데이터 섹션: KIS 시세 차트(PNG) + 수익률 표 + 결정적 사실 문장
 * 2) AI 이미지: 커버 1장 + 섹션 이미지 최대 3장 (gpt-image, 사진풍 · 텍스트/로고/수치 금지)
 *
 * 전부 best-effort다. 시각자료는 발행 게이트가 아니므로 어떤 실패도 throw하지 않고
 * 그 이미지만 뺀 본문을 돌려준다. 예산(VISUAL_CONFIG.budget)을 넘기면 끝난 것만 싣는다.
 */

import { randomBytes } from 'node:crypto';
import { generateImage, generateText } from '@/lib/llm/openai-client';
import { VISUAL_CONFIG } from '../_config/pipeline-config';
import { IMAGE_STYLE_SUFFIX, buildVisualPlanPrompt } from '../_prompts/visual-plan';
import { renderComparisonChart, renderPriceChart } from './chart-renderer';
import { removeBlogImages, uploadBlogImage } from './image-storage';
import {
  buildDataSection,
  chartAlt,
  comparisonChartTitle,
  dataSectionTitle,
  insertAfterFirstSection,
  insertCover,
  insertInSection,
  listH2Headings,
  type ImageRef,
} from '../_utils/markdown-visuals';
import type { MarketContext } from './market-data';

const AI_IMAGE_LABEL = 'AI 생성 이미지';
const MIN_ATTEMPT_MS = 20_000;
/** 마감 뒤 이만큼만 더 기다리고 끝난 것만 싣는다 (진행 중 업로드가 마저 끝날 여유) */
const CLOSE_GRACE_MS = 20_000;
/** 업로드 직후 공개 URL 확인 상한 */
const PUBLIC_CHECK_TIMEOUT_MS = 10_000;

/** AI 이미지 활성화 여부 — `BLOG_AI_IMAGES=off`로 끌 수 있다(실측 데이터 섹션은 유지) */
function aiImagesEnabled(): boolean {
  return process.env.BLOG_AI_IMAGES !== 'off';
}

export interface PlannedImage {
  readonly scene: string;
  readonly alt: string;
  readonly caption: string;
  /** 섹션 이미지면 H2 제목, 커버면 null */
  readonly heading: string | null;
}

export interface PostVisualsResult {
  readonly markdown: string;
  /** 정리용 — 이 run이 올린 스토리지 경로 */
  readonly uploadedPaths: readonly string[];
  readonly summary: { readonly chart: boolean; readonly cover: boolean; readonly sections: number };
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --- 기획 파싱 (순수) ---

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const promptSafe = (text: string) => text.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 기획 JSON 검증. 섹션 heading은 본문 H2와 정확히 일치해야 하며(무해화 비교),
 * 장면·alt가 비거나 짧으면 그 항목을 버린다.
 */
export function parseVisualPlan(raw: string, headings: readonly string[], maxSections: number): PlannedImage[] {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('기획 JSON 없음');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

  const toImage = (v: unknown, heading: string | null): PlannedImage | null => {
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    const scene = str(o.scene, 900);
    const alt = str(o.alt, 160);
    const caption = str(o.caption, 80);
    if (scene.length < 40 || alt.length < 10 || caption.length < 4) return null;
    return { scene, alt, caption, heading };
  };

  const plan: PlannedImage[] = [];
  const cover = toImage(parsed.cover, null);
  if (cover) plan.push(cover);

  const bySafe = new Map(headings.map((h) => [promptSafe(h), h]));
  const used = new Set<string>();
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  for (const s of sections) {
    if (used.size >= maxSections) break;
    const heading = bySafe.get(promptSafe(str((s as Record<string, unknown>)?.heading, 200)));
    if (!heading || used.has(heading) || heading.startsWith('데이터로 보는')) continue;
    const image = toImage(s, heading);
    if (!image) continue;
    used.add(heading);
    plan.push(image);
  }
  return plan;
}

/** 기획 실패 시 커버 1장만 — 키워드를 화면 속 글자로 그리지 않도록 영어 장면으로만 지시 */
export function fallbackCoverPlan(keyword: string): PlannedImage {
  return {
    scene: 'A calm, modern investment research desk by a large window at dawn: a closed laptop, a notebook with a pen, a cup of coffee and soft city skyline in the background, shallow depth of field, quiet professional atmosphere.',
    alt: `${keyword} 글의 커버로 쓰인, 창가 업무 책상 위 노트북과 노트를 담은 이미지`,
    caption: `${keyword} 분석을 표현한 이미지`,
    heading: null,
  };
}

/** 본문 → 기획 입력 (H2와 그 섹션 앞부분) */
function sectionExcerpts(markdown: string): Array<{ heading: string; excerpt: string }> {
  const out: Array<{ heading: string; excerpt: string }> = [];
  const parts = markdown.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const [first, ...rest] = part.split('\n');
    out.push({
      heading: promptSafe(first.trim()),
      excerpt: promptSafe(rest.join(' ').replace(/[#*|>`]/g, ' ')).slice(0, 360),
    });
  }
  return out;
}

// --- 생성 ---

/**
 * 다음 모델로 넘어갈 오류인가.
 * 모델 권한·미지원(400/403/404)과 일시 장애(429/5xx)만 넘어간다. 정책 차단은 어느 모델이든 같고,
 * 타임아웃은 취소된 요청도 과금될 수 있어 같은 장면을 다른 모델로 또 부르지 않는다.
 */
export function shouldTryNextModel(error: unknown): boolean {
  const e = error as { status?: number; code?: string | null; message?: string };
  if (e?.status === 400 && /moderation|content_policy|safety/i.test(`${e.code ?? ''} ${e.message ?? ''}`)) return false;
  return e?.status === 400 || e?.status === 403 || e?.status === 404 || e?.status === 429 || (e?.status ?? 0) >= 500;
}

async function generateWithFallback(prompt: string, quality: 'medium' | 'high', deadline: number): Promise<Buffer | null> {
  const { width, height } = VISUAL_CONFIG.imageSize;
  for (const model of VISUAL_CONFIG.imageModels) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) return null;
    try {
      return await generateImage({ prompt, model, size: `${width}x${height}`, quality, timeout: Math.min(VISUAL_CONFIG.imageTimeout, remaining) });
    } catch (error) {
      console.warn(`[Visuals] ${model} 실패: ${err(error).slice(0, 200)}`);
      if (!shouldTryNextModel(error)) return null;
    }
  }
  return null;
}

async function planImages(input: { keyword: string; title: string; markdown: string }, deadline: number): Promise<PlannedImage[]> {
  const sections = sectionExcerpts(input.markdown);
  const headings = listH2Headings(input.markdown);
  try {
    const raw = await generateText({
      prompt: buildVisualPlanPrompt({ keyword: promptSafe(input.keyword), title: promptSafe(input.title), sections, maxSections: VISUAL_CONFIG.maxSectionImages }),
      config: { responseMimeType: 'application/json', reasoningEffort: 'low', maxOutputTokens: 4000 },
      timeout: Math.max(1, Math.min(VISUAL_CONFIG.planTimeout, deadline - Date.now() - MIN_ATTEMPT_MS * 2)),
    });
    const plan = parseVisualPlan(raw, headings, VISUAL_CONFIG.maxSectionImages);
    if (plan.some((p) => p.heading === null)) return plan;
    return [fallbackCoverPlan(input.keyword), ...plan];
  } catch (error) {
    console.warn(`[Visuals] 기획 실패 — 커버만 생성: ${err(error)}`);
    return [fallbackCoverPlan(input.keyword)];
  }
}

// --- 오케스트레이션 ---

interface PlacedImage {
  readonly plan: PlannedImage;
  readonly image: ImageRef;
}

/** 끝난 결과로 본문을 조립한다. 섹션 이미지 → 데이터 섹션 → 커버 순서(데이터 섹션은 새 H2라 먼저 넣으면 헤딩 탐색이 바뀐다) */
function assemble(markdown: string, market: MarketContext | null, chart: ImageRef | null, images: readonly PlacedImage[]) {
  let out = markdown;
  let sections = 0;
  for (const { plan, image } of images) {
    if (plan.heading === null) continue;
    const next = insertInSection(out, plan.heading, image);
    if (next) { out = next; sections += 1; }
  }
  if (market) out = insertAfterFirstSection(out, buildDataSection(market, chart));
  const cover = images.find((r) => r.plan.heading === null);
  if (cover) out = insertCover(out, cover.image);
  return { markdown: out, summary: { chart: chart !== null && out.includes(chart.url), cover: !!cover, sections } };
}

/** 공개 URL이 실제로 읽히는가 (버킷 공개 설정·URL 조립 오류를 발행 전에 잡는다) */
async function isPubliclyReadable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(PUBLIC_CHECK_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 시각자료를 만들고 본문에 끼운다. 절대 throw하지 않는다.
 *
 * 마감(+유예)에 끝난 결과만 싣고, 그 뒤에 끝나는 업로드는 스스로 지운다 — 한 장이 멈춰도
 * 이미 끝난 차트·이미지를 버리지 않고, 실리지 않은 파일을 스토리지에 남기지 않는다.
 * @param input.slug - 스토리지 경로 접두사 (run 고유값이 붙어 다른 글과 충돌하지 않는다)
 * @param input.budgetMs - 이 단계에 쓸 시간 (기본 VISUAL_CONFIG.budget)
 */
export async function createPostVisuals(input: {
  slug: string;
  keyword: string;
  title: string;
  markdown: string;
  market: MarketContext | null;
  budgetMs?: number;
}): Promise<PostVisualsResult> {
  const startedAt = Date.now();
  const deadline = startedAt + Math.min(input.budgetMs ?? VISUAL_CONFIG.budget, VISUAL_CONFIG.budget);
  const runId = `${startedAt.toString(36)}${randomBytes(3).toString('hex')}`;
  const uploadedPaths: string[] = [];
  let closed = false;
  const upload = async (name: string, data: Buffer, ext: 'webp' | 'png', size: { width: number; height: number }) => {
    const path = `posts/${input.slug}/${runId}-${name}-${size.width}x${size.height}.${ext}`;
    const url = await uploadBlogImage(path, data, `image/${ext}`);
    if (closed) {
      await removeBlogImages([path]).catch(() => {});
      throw new Error(`마감 후 업로드 — 폐기 (${path})`);
    }
    uploadedPaths.push(path);
    return url;
  };

  // 비동기 작업이 채우는 결과 (마감 시점의 스냅샷으로 조립한다)
  const done: { chart: ImageRef | null; images: PlacedImage[] } = { chart: null, images: [] };

  const chartTask = (async () => {
    const ctx = input.market;
    if (!ctx) return;
    try {
      const png = ctx.stocks.length === 1 ? await renderPriceChart(ctx.stocks[0]) : await renderComparisonChart(ctx.stocks, comparisonChartTitle(ctx));
      const url = await upload('chart', png, 'png', VISUAL_CONFIG.chartSize);
      done.chart = { url, alt: chartAlt(ctx), caption: `${dataSectionTitle(ctx)} · 출처 한국투자증권 Open API, 기준일 ${ctx.asOf}` };
    } catch (error) {
      console.warn(`[Visuals] 차트 실패 — 표만 싣는다: ${err(error)}`);
    }
  })();

  const imageTask = (async () => {
    if (!aiImagesEnabled()) {
      console.log('[Visuals] AI 이미지 꺼짐 (BLOG_AI_IMAGES=off)');
      return;
    }
    const plan = await planImages(input, deadline);
    await Promise.all(plan.map(async (p, i) => {
      const quality = p.heading === null ? VISUAL_CONFIG.coverQuality : VISUAL_CONFIG.sectionQuality;
      const webp = await generateWithFallback(`${p.scene}\n\n${IMAGE_STYLE_SUFFIX}`, quality, deadline);
      if (!webp) return;
      try {
        const url = await upload(p.heading === null ? 'cover' : `section${i}`, webp, 'webp', VISUAL_CONFIG.imageSize);
        done.images.push({ plan: p, image: { url, alt: p.alt, caption: `${p.caption} · ${AI_IMAGE_LABEL}` } });
      } catch (error) {
        console.warn(`[Visuals] 업로드 실패: ${err(error)}`);
      }
    }));
  })();

  try {
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise<void>((resolve) => { timer = setTimeout(resolve, Math.max(0, deadline - Date.now()) + CLOSE_GRACE_MS); });
    await Promise.race([Promise.all([chartTask, imageTask]), late]);
    clearTimeout(timer);
    closed = true;

    const { chart } = done;
    const images = [...done.images];
    let result = assemble(input.markdown, input.market, chart, images);

    const firstUrl = [chart?.url, ...images.map((r) => r.image.url)].find((u): u is string => !!u && result.markdown.includes(u));
    if (firstUrl && !(await isPubliclyReadable(firstUrl))) {
      console.warn(`[Visuals] 공개 URL을 읽을 수 없음 — 이미지 없이 싣는다: ${firstUrl}`);
      result = assemble(input.markdown, input.market, null, []);
    }

    // 본문에 실리지 못한 업로드는 바로 지운다
    const used = uploadedPaths.filter((p) => result.markdown.includes(p));
    await removeBlogImages(uploadedPaths.filter((p) => !result.markdown.includes(p))).catch(() => {});

    const { summary } = result;
    console.log(`[Visuals] 차트 ${summary.chart ? 1 : 0} · 커버 ${summary.cover ? 1 : 0} · 섹션 ${summary.sections} (${Math.round((Date.now() - startedAt) / 1000)}초)`);
    return { markdown: result.markdown, uploadedPaths: used, summary };
  } catch (error) {
    closed = true;
    console.error(`[Visuals] 조립 실패 — 시각자료 없이 진행: ${err(error)}`);
    await removeBlogImages(uploadedPaths).catch(() => {});
    return { markdown: input.markdown, uploadedPaths: [], summary: { chart: false, cover: false, sections: 0 } };
  }
}
