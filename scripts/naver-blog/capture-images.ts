#!/usr/bin/env tsx
/**
 * 테마 상세·목록·방법론 페이지 스크린샷 캡처 — 네이버 발행용 이미지
 *
 * 파일 생성만으로 유효하다고 보지 않는다. 섹션 안에 데이터 선·종목 행이
 * 실제로 있는지 검사하고, theme 글에서는 전망·유사패턴을 기본 제외한다.
 */

import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import {
  hasUsableDataLine,
  isEmptyChartCopy,
  shouldIncludeTrend,
  shouldSplitStocks,
  stockRowsMatch,
} from './capture-validate';
import { snapshotCaption, type SourceSnapshot } from './draft-model';
import type { PostType } from './post-types';

const SITE = 'https://stockmatrix.co.kr';
const MIN_IMAGE_BYTES = 15_000;
const VIEWPORT_WIDTH = 1_400;

export interface CapturedImage {
  caption: string;
  name: string;
  path: string;
}

export interface CaptureRequest {
  asOf?: string;
  expectedStockCount?: number;
  kind: PostType;
  outDir: string;
  snapshot?: SourceSnapshot;
  themeId: string;
  themeName?: string;
}

interface Target {
  heading: string | null;
  name: string;
  needsDataLine?: boolean;
  page: 'list' | 'methodology' | 'theme';
  required: boolean;
  splitStocks?: boolean;
}

const THEME_TARGETS: readonly Target[] = [
  { heading: null, name: '1-hero', page: 'theme', required: true },
  { heading: '관련종목', name: '2-stocks', page: 'theme', required: true, splitStocks: true },
  { heading: '점수 추이', name: '3-trend', page: 'theme', required: false, needsDataLine: true },
  { heading: '관련뉴스', name: '4-news', page: 'theme', required: false },
];

const SIMILAR_TARGETS: readonly Target[] = [
  { heading: null, name: '1-hero', page: 'theme', required: true },
  { heading: '관련종목', name: '2-stocks', page: 'theme', required: true, splitStocks: true },
  { heading: '점수 추이', name: '3-trend', page: 'theme', required: false, needsDataLine: true },
  { heading: '유사패턴', name: '4-pattern', page: 'theme', required: false },
];

const NEWS_TARGETS: readonly Target[] = [
  { heading: null, name: '1-hero', page: 'theme', required: true },
  { heading: '관련종목', name: '2-stocks', page: 'theme', required: false, splitStocks: true },
  { heading: '관련뉴스', name: '4-news', page: 'theme', required: true },
  { heading: '점수 추이', name: '3-trend', page: 'theme', required: false, needsDataLine: true },
];

const RANKING_TARGETS: readonly Target[] = [
  { heading: null, name: '1-hero', page: 'list', required: true },
  { heading: '오늘의 시그널', name: '2-signals', page: 'list', required: true },
  { heading: '정점 단계', name: '3-peak', page: 'list', required: true },
  { heading: '성장 단계', name: '4-growth', page: 'list', required: true },
];

const EVERGREEN_TARGETS: readonly Target[] = [
  { heading: null, name: '1-hero', page: 'methodology', required: true },
  { heading: '테마 점수란?', name: '2-score', page: 'methodology', required: true },
  { heading: '점수를 이루는 4가지 요소', name: '3-stages', page: 'methodology', required: true },
  { heading: '테마 상태 5단계와 재점화', name: '4-limits', page: 'methodology', required: true },
];

function targetsFor(kind: PostType): readonly Target[] {
  if (kind === 'ranking') return RANKING_TARGETS;
  if (kind === 'evergreen') return EVERGREEN_TARGETS;
  if (kind === 'similar') return SIMILAR_TARGETS;
  if (kind === 'news') return NEWS_TARGETS;
  return THEME_TARGETS;
}

function pageUrl(target: Target, themeId: string): string {
  if (target.page === 'list') return `${SITE}/themes`;
  if (target.page === 'methodology') return `${SITE}/themes/methodology`;
  return `${SITE}/themes/${themeId}`;
}

async function waitForThemeReady(page: Page): Promise<void> {
  await page
    .waitForFunction(() => {
      const circles = [...document.querySelectorAll('svg circle')];
      return circles.some((c) => {
        const dash = parseFloat((c.getAttribute('stroke-dasharray') ?? '').split(/[\s,]/)[0]);
        const offset = parseFloat(c.getAttribute('stroke-dashoffset') ?? '');
        return Number.isFinite(dash) && Number.isFinite(offset) && offset < dash * 0.98;
      });
    }, null, { timeout: 10_000 })
    .catch(() => {
      throw new Error('점수 게이지가 렌더되지 않았습니다 (10초) — 빈 이미지를 발행하지 않습니다');
    });

  await page
    .locator('text=/데이터를 준비하고 있어요|Loading|불러오는 중/')
    .first()
    .waitFor({ state: 'hidden', timeout: 8_000 })
    .catch(() => {});
  await page.waitForTimeout(1_500);
}

type ClipRect = { height: number; width: number; x: number; y: number };

async function findSectionClip(page: Page, heading: string): Promise<ClipRect | null> {
  return page.evaluate((text) => {
    const heads = [...document.querySelectorAll('h1,h2')]
      .map((h) => ({ el: h, top: h.getBoundingClientRect().top + window.scrollY }))
      .sort((a, b) => a.top - b.top);

    const wanted = text.replace(/\s+/g, '');
    const idx = heads.findIndex((h) => (h.el.textContent ?? '').replace(/\s+/g, '').includes(wanted));
    if (idx === -1) return null;

    const target = heads[idx];
    const top = target.top - 16;
    const next = heads.slice(idx + 1).find((h) => h.top > target.top + 60);
    const bottom = next ? next.top - 16 : Math.min(document.body.scrollHeight, top + 1_200);
    const height = Math.min(Math.max(bottom - top, 0), 1_400);
    if (height < 80) return null;

    let column = target.el.parentElement;
    for (let i = 0; i < 5 && column; i++) {
      const w = column.getBoundingClientRect().width;
      if (w > 200) break;
      column = column.parentElement;
    }
    const colRect = (column ?? target.el).getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const isColumn = colRect.width < viewportWidth * 0.6 && colRect.width > 200;
    const x = isColumn ? Math.max(0, Math.floor(colRect.left) - 24) : 0;
    const width = isColumn
      ? Math.min(Math.ceil(colRect.width) + 48, viewportWidth - x)
      : Math.min(viewportWidth, 1_400);

    return { x, y: top, width, height };
  }, heading);
}

/**
 * 히어로 카드 영역.
 *
 * 첫 h1(테마명·페이지 제목)을 감싸는 카드 컨테이너를 찾아 그 사각형을 돌려준다.
 * 카드가 화면보다 길면 잘리는 대신 전체를 담는다(높이 상한 1,500).
 */
async function findHeroClip(page: Page): Promise<ClipRect | null> {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return null;

    // 카드로 볼 만한 조상: 폭이 넓고 배경/테두리를 가진 블록
    let card: HTMLElement | null = h1.parentElement;
    for (let i = 0; i < 8 && card; i += 1) {
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const framed = cs.borderRadius !== '0px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
      if (r.width > 900 && r.height > 300 && framed) break;
      card = card.parentElement;
    }
    if (!card) return null;

    const r = card.getBoundingClientRect();
    if (r.width < 600 || r.height < 200) return null;

    const pad = 16;
    const x = Math.max(0, Math.floor(r.left) - pad);
    const y = Math.max(0, Math.floor(r.top + window.scrollY) - pad);
    const width = Math.min(Math.ceil(r.width) + pad * 2, document.documentElement.clientWidth - x);
    const height = Math.min(Math.ceil(r.height) + pad * 2, 1_500);
    return { x, y, width, height };
  });
}

interface SectionInspect {
  dataLineCount: number;
  emptyCopy: boolean;
  longestPath: number;
  pathDs: string[];
  stockRows: number;
  text: string;
}

async function inspectSection(page: Page, clip: ClipRect): Promise<SectionInspect> {
  return page.evaluate((box) => {
    const paths = [...document.querySelectorAll('.recharts-surface path[d]')].filter((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return top < box.y + box.height && top + r.height > box.y;
    }).map((el) => el.getAttribute('d') ?? '');
    const usable = paths.filter((d) => d.length >= 60);
    const rows = [...document.querySelectorAll('a[aria-label$="상세 보기"]')].filter((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return top < box.y + box.height && top + r.height > box.y;
    });
    // 문서 전체 텍스트를 보면 안 된다. 테마 상세의 비교 워크스페이스는 비교 대상을
    // 고르기 전까지 항상 "비교선이 아직 없어요"를 표시하므로, 전체를 검사하면
    // 정상 추이 차트도 매번 "빈 차트"로 제외되고 이미지가 최소 장수에 못 미친다.
    const text = [...document.querySelectorAll('p, span, h2, h3, li, td, button, div')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.height === 0) return false;
        const top = r.top + window.scrollY;
        return top < box.y + box.height && top + r.height > box.y;
      })
      .map((el) => el.textContent ?? '')
      .join(' ');
    return {
      dataLineCount: usable.length,
      emptyCopy: /비교선이 아직 없어요|데이터가 없어요|표시할 데이터가 없/.test(text),
      longestPath: Math.max(0, ...paths.map((d) => d.length)),
      pathDs: usable,
      stockRows: rows.length,
      text,
    };
  }, clip);
}

async function expandOverflow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const nodes = document.querySelectorAll('.overflow-y-auto');
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (!(el instanceof HTMLElement)) continue;
      el.style.maxHeight = 'none';
      el.style.height = 'auto';
      el.style.overflow = 'visible';
    }
  });
}

async function showStockRange(page: Page, start: number, end: number): Promise<void> {
  await page.evaluate(([from, to]) => {
    const rows = [...document.querySelectorAll('a[aria-label$="상세 보기"]')];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (row instanceof HTMLElement) row.style.display = i >= from && i < to ? '' : 'none';
    }
  }, [start, end]);
}

async function screenshotClip(page: Page, path: string, clip: { height: number; width: number; x: number; y: number }): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path, clip, fullPage: true });
  const bytes = statSync(path).size;
  if (bytes < MIN_IMAGE_BYTES) {
    throw new Error(`캡처가 비어 보입니다 (${Math.round(bytes / 1024)}KB < ${MIN_IMAGE_BYTES / 1024}KB)`);
  }
}

function captionOf(name: string, req: CaptureRequest): string {
  return snapshotCaption(name, req.themeName ?? 'StockMatrix', req.snapshot ?? {}, req.asOf);
}

export async function capturePostImages(req: CaptureRequest, browser?: Browser): Promise<CapturedImage[]> {
  const own = !browser;
  const b = browser ?? (await chromium.launch());
  const context = await b.newContext({
    deviceScaleFactor: 1.5,
    locale: 'ko-KR',
    viewport: { width: VIEWPORT_WIDTH, height: 1_000 },
  });
  const page = await context.newPage();
  if (!existsSync(req.outDir)) mkdirSync(req.outDir, { recursive: true });

  const images: CapturedImage[] = [];
  const targets = targetsFor(req.kind);
  let opened = '';

  try {
    for (const target of targets) {
      const url = pageUrl(target, req.themeId);
      if (opened !== url) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        opened = url;
        if (target.page === 'theme') await waitForThemeReady(page);
        else await page.waitForTimeout(2_000);
      }

      const path = join(req.outDir, `${target.name}.png`);
      try {
        if (target.heading === null) {
          // 고정 rect(0,0,1400,820)는 상단에 사이트 내비·장식 배경 약 280px를 넣고
          // 카드 하단(구성요소 바·주요 변동 종목)을 잘랐다(실측). 히어로 카드 자체를
          // 찾아 그 영역만 찍는다. 못 찾으면 기존 고정 rect로 떨어진다.
          const heroClip = await findHeroClip(page);
          await page.screenshot({
            path,
            clip: heroClip ?? { x: 0, y: 0, width: VIEWPORT_WIDTH, height: 820 },
            fullPage: heroClip != null,
          });
          const bytes = statSync(path).size;
          if (bytes < MIN_IMAGE_BYTES) throw new Error(`히어로 캡처가 비어 있습니다 (${bytes}B)`);
          images.push({ name: target.name, path, caption: captionOf(target.name, req) });
          continue;
        }

        await page
          .locator('h1,h2')
          .filter({ hasText: new RegExp(target.heading.replace(/\s+/g, '\\s*')) })
          .first()
          .waitFor({ state: 'attached', timeout: 15_000 });
        if (target.splitStocks) await expandOverflow(page);
        const probe = await findSectionClip(page, target.heading);
        if (!probe) {
          const headings = await page.locator('h1,h2').allInnerTexts().catch(() => []);
          if (target.required) {
            throw new Error(`섹션 "${target.heading}"을 찾지 못함 (h1/h2: ${headings.map((t) => t.replace(/\s+/g, '')).join(', ')})`);
          }
          console.warn(`[Capture] 섹션 "${target.heading}" 없음 — 건너뜀`);
          continue;
        }
        await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 100)), probe.y);
        await page.waitForTimeout(1_200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);

        if (target.splitStocks) await expandOverflow(page);

        const clip = await findSectionClip(page, target.heading);
        if (!clip) {
          if (target.required) throw new Error(`섹션 "${target.heading}" 재계산 실패`);
          continue;
        }
        const inspect = await inspectSection(page, clip);

        if (target.needsDataLine) {
          const empty = inspect.emptyCopy || isEmptyChartCopy(inspect.text);
          const usable = hasUsableDataLine(inspect.pathDs.map((d) => ({ d })));
          if (!shouldIncludeTrend({ emptyCopy: empty, dataLineCount: usable ? 1 : 0 })) {
            if (target.required) throw new Error(`섹션 "${target.heading}"에 데이터 선이 없습니다`);
            console.warn(`[Capture] ${target.name} 빈 차트 — 제외`);
            continue;
          }
        }

        if (target.splitStocks && req.expectedStockCount) {
          if (!stockRowsMatch(inspect.stockRows, req.expectedStockCount)) {
            await expandOverflow(page);
            const again = await inspectSection(page, clip);
            if (!stockRowsMatch(again.stockRows, req.expectedStockCount)) {
              throw new Error(`관련종목 ${req.expectedStockCount}개인데 ${again.stockRows}행만 보임`);
            }
          }
          if (shouldSplitStocks(req.expectedStockCount)) {
            const mid = Math.ceil(req.expectedStockCount / 2);
            await showStockRange(page, 0, mid);
            const firstClip = await findSectionClip(page, target.heading);
            if (!firstClip) throw new Error('관련종목 전반부 클립 실패');
            const firstPath = join(req.outDir, '2-stocks-a.png');
            await screenshotClip(page, firstPath, firstClip);
            images.push({
              name: '2-stocks-a',
              path: firstPath,
              caption: captionOf('2-stocks-a', req),
            });

            await showStockRange(page, mid, req.expectedStockCount);
            const secondClip = await findSectionClip(page, target.heading);
            if (!secondClip) throw new Error('관련종목 후반부 클립 실패');
            const secondPath = join(req.outDir, '2-stocks-b.png');
            await screenshotClip(page, secondPath, secondClip);
            images.push({
              name: '2-stocks-b',
              path: secondPath,
              caption: captionOf('2-stocks-b', req),
            });
            await showStockRange(page, 0, req.expectedStockCount);
            continue;
          }
        }

        await screenshotClip(page, path, clip);
        images.push({
          name: target.name,
          path,
          caption: captionOf(target.name, req),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (target.required) throw new Error(`필수 캡처 실패 (${target.name}): ${message}`);
        console.warn(`[Capture] ${target.name} 실패 — 건너뜀: ${message}`);
      }
    }
  } finally {
    await context.close();
    if (own) await b.close();
  }

  return images;
}

/** CLI·기존 호출 호환. theme 글 기준으로 캡처한다. */
export async function captureThemeImages(
  themeId: string,
  outDir: string,
  browser?: Browser,
): Promise<CapturedImage[]> {
  return capturePostImages({ kind: 'theme', outDir, themeId }, browser);
}

if (process.argv[1]?.includes('capture-images')) {
  const themeId = process.argv[2];
  if (!themeId) {
    console.error('사용법: tsx scripts/naver-blog/capture-images.ts <themeId> [outDir]');
    process.exit(1);
  }
  captureThemeImages(themeId, process.argv[3] ?? '.naver-blog/images')
    .then((imgs) => {
      console.log(`캡처 ${imgs.length}장`);
      for (const i of imgs) console.log(`  ${i.name}: ${i.path}`);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
