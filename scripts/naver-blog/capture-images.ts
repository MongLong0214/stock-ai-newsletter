#!/usr/bin/env tsx
/**
 * 테마 상세 페이지 스크린샷 캡처 — 네이버 발행용 이미지
 *
 * FORMAT-SPEC: 이미지 최소 4장, 자사 페이지 실제 화면만 사용(외부 이미지 금지).
 * 0장은 발행 차단 조건이므로 이 모듈의 실패는 발행 실패로 이어져야 한다.
 *
 * 캡처 대상은 CSS 클래스가 아니라 **화면에 보이는 한국어 제목**으로 찾는다.
 * Tailwind 클래스(mb-8, grid grid-cols-1 …)는 스타일 변경마다 바뀌지만
 * "관련종목" 같은 섹션 제목은 콘텐츠라 훨씬 안정적이다.
 */

import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const SITE = 'https://stockmatrix.co.kr';

/** 캡처 대상 — 순서가 곧 본문 삽입 순서다. required는 실패 시 발행을 막는다. */
const TARGETS = [
  // 히어로: 테마명·단계·게이지·점수구성요소·주요변동종목이 한 화면에 들어가는 최고 밀도 이미지
  { heading: null, name: '1-hero', required: true },
  { heading: '관련종목', name: '2-stocks', required: true },
  { heading: '점수 추이', name: '3-trend', required: false },
  { heading: '유사패턴', name: '4-pattern', required: false },
  { heading: '테마전망', name: '5-outlook', required: false },
  { heading: '관련뉴스', name: '6-news', required: false },
] as const;

/** 정상 캡처의 하한. 이 밑이면 렌더가 안 된 빈 영역으로 본다. */
const MIN_IMAGE_BYTES = 15_000;

export interface CapturedImage {
  name: string;
  path: string;
}

/**
 * 차트 렌더 대기.
 *
 * networkidle만으로는 부족하다 — Recharts는 데이터 도착 후 클라이언트에서 SVG를
 * 그리므로 네트워크가 조용해진 뒤에도 빈 영역일 수 있다. SVG가 실제로 나타나고
 * 애니메이션이 끝날 때까지 기다린다.
 */
async function waitForCharts(page: Page): Promise<void> {
  // networkidle은 쓰지 않는다 — 이 페이지는 클라이언트 렌더이고 시세 폴링이 있어
  // 조용해지지 않거나 너무 늦게 온다. 그려진 결과 자체를 조건으로 본다.

  // 점수 게이지: strokeDashoffset이 빈 원(=dasharray) 근처면 아직 애니메이션 전이다
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
      // 히어로(required)의 핵심이 이 게이지다. 경고만 하고 넘어가면 빈 원이 찍힌
      // PNG가 "이미지 4장 확보"로 계산되어 그대로 발행된다. 여기서 끊는다 —
      // 발행 실패는 이슈로 올라오지만, 빈 차트가 올라간 글은 아무도 모른다.
      throw new Error('점수 게이지가 렌더되지 않았습니다 (10초) — 빈 이미지를 발행하지 않습니다');
    });

  // Recharts: path의 d가 실제 경로를 담고 컨테이너 폭이 잡혔는지
  await page
    .waitForFunction(() => {
      const path = document.querySelector('.recharts-surface path[d]');
      if (!path) return true; // 차트가 없는 페이지도 있다
      const d = path.getAttribute('d') ?? '';
      const box = path.closest('.recharts-wrapper')?.getBoundingClientRect();
      return d.length > 40 && (box?.width ?? 0) > 100;
    }, null, { timeout: 10_000 })
    .catch(() => console.warn('[Capture] 차트 렌더 대기 시간 초과 — 계속 진행'));

  // 스켈레톤·로딩 문구가 남아 있으면 빈 영역이 찍힌다
  await page
    .locator('text=/데이터를 준비하고 있어요|Loading|불러오는 중/')
    .first()
    .waitFor({ state: 'hidden', timeout: 8_000 })
    .catch(() => {});

  // 프레이머모션 잔여 트랜지션(게이지 1.5s, 바 0.8s) 종료 여유
  await page.waitForTimeout(2_000);
}

/**
 * 헤딩으로 섹션을 찾아 캡처 영역(x, y, w, h)을 돌려준다. 못 찾으면 null.
 *
 * 요소 핸들이 아니라 좌표를 쓰는 이유: 섹션 래퍼가 헤딩보다 훨씬 크거나
 * (페이지 전체) 작을 수 있어 조상 탐색이 불안정하다. 헤딩 위치에서
 * 다음 헤딩 직전까지를 잘라내는 편이 레이아웃 변경에 강하다.
 */
async function findSectionClip(page: Page, heading: string) {
  return page.evaluate((text) => {
    // 섹션 경계는 h1/h2만 쓴다. h3는 카드 내부 제목(개별 테마명·종목명)이라
    // 경계로 삼으면 섹션이 80px짜리로 잘린다.
    const heads = [...document.querySelectorAll('h1,h2')]
      .map((h) => ({ el: h, top: h.getBoundingClientRect().top + window.scrollY }))
      // DOM 순서가 아니라 화면 순서로 정렬한다 — 좌우 2단 그리드에서는
      // "유사패턴"(y=2290)과 "점수 추이비교"(y=2296)처럼 DOM 순서가 뒤엉킨다
      .sort((a, b) => a.top - b.top);

    const wanted = text.replace(/\s+/g, '');
    const idx = heads.findIndex((h) => (h.el.textContent ?? '').replace(/\s+/g, '').includes(wanted));
    if (idx === -1) return null;

    const target = heads[idx];
    const rect = target.el.getBoundingClientRect();
    const top = target.top - 16;

    // 나란히 배치된 헤딩(세로 간격 60px 미만)은 같은 행이므로 경계로 쓰지 않는다
    const next = heads.slice(idx + 1).find((h) => h.top > target.top + 60);
    const bottom = next ? next.top - 16 : Math.min(document.body.scrollHeight, top + 1_200);

    const height = Math.min(Math.max(bottom - top, 0), 900);
    if (height < 150) return null;

    // 열 폭은 헤딩 텍스트 폭이 아니라 이를 감싸는 레이아웃 블록에서 잰다.
    // 헤딩 rect.width는 글자 길이(63~108px)라 그걸로 자르면 세로 띠가 나온다.
    let column = target.el.parentElement;
    for (let i = 0; i < 5 && column; i++) {
      const w = column.getBoundingClientRect().width;
      if (w > 200) break;
      column = column.parentElement;
    }
    const colRect = (column ?? target.el).getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;

    // 뷰포트의 60% 미만이면 2단 그리드의 한 열로 보고 그 열만, 아니면 전체 폭
    const isColumn = colRect.width < viewportWidth * 0.6 && colRect.width > 200;
    const x = isColumn ? Math.max(0, Math.floor(colRect.left) - 24) : 0;
    const width = isColumn
      ? Math.min(Math.ceil(colRect.width) + 48, viewportWidth - x)
      : Math.min(viewportWidth, 1_400);

    return { x, y: top, width, height };
  }, heading);
}

export async function captureThemeImages(
  themeId: string,
  outDir: string,
  browser?: Browser,
): Promise<CapturedImage[]> {
  const own = !browser;
  const b = browser ?? (await chromium.launch());
  const context = await b.newContext({
    // 1.5배 — 네이버 본문 폭(약 700px)에서 선명하면서 파일이 과하지 않다.
    // 2배로 찍으면 관련종목 표가 1.6MB가 되고 문서 처리 오류를 유발한다(실측).
    deviceScaleFactor: 1.5,
    locale: 'ko-KR',
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const images: CapturedImage[] = [];

  try {
    await page.goto(`${SITE}/themes/${themeId}`, { waitUntil: 'domcontentloaded' });
    await waitForCharts(page);

    for (const target of TARGETS) {
      const path = join(outDir, `${target.name}.png`);
      try {
        if (target.heading === null) {
          await page.screenshot({ path, clip: { x: 0, y: 0, width: 1400, height: 820 } });
        } else {
          // 1차 계산 → 그 위치로 스크롤(지연 렌더 유발) → 재계산.
          // 스크롤로 레이아웃이 늘어나면 첫 좌표가 어긋나므로 반드시 다시 잰다.
          const probe = await findSectionClip(page, target.heading);
          if (!probe) {
            if (target.required) throw new Error(`섹션 "${target.heading}"을 찾지 못함`);
            console.warn(`[Capture] 섹션 "${target.heading}" 없음 — 건너뜀`);
            continue;
          }
          await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 100)), probe.y);
          // 뷰포트 진입으로 지연 렌더가 시작된다 — 차트가 그려질 때까지 기다린다.
          // 스크롤 직후 캡처하면 축만 있고 선이 없는 빈 차트가 찍힌다(실측).
          await page
            .waitForFunction(() => {
              const paths = [...document.querySelectorAll('.recharts-surface path[d]')];
              if (paths.length === 0) return true; // 차트 없는 섹션
              return paths.some((el) => (el.getAttribute('d') ?? '').length > 60);
            }, null, { timeout: 8_000 })
            .catch(() => {
              throw new Error(`섹션 "${target.heading}" 차트가 렌더되지 않았습니다 (8초)`);
            });
          await page.waitForTimeout(1_500);

          // 스크롤을 최상단으로 되돌리고 문서 절대좌표로 fullPage 캡처한다.
          // 스크롤된 상태에서 clip을 쓰면 지연 렌더로 레이아웃 높이가 변한 만큼
          // 좌표가 밀려 엉뚱한 영역이 찍힌다(실측: 차트가 빈 축만 나옴).
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(500);

          const clip = await findSectionClip(page, target.heading);
          if (!clip) {
            if (target.required) throw new Error(`섹션 "${target.heading}" 재계산 실패`);
            console.warn(`[Capture] 섹션 "${target.heading}" 재계산 실패 — 건너뜀`);
            continue;
          }
          await page.screenshot({ path, clip, fullPage: true });
        }
        // 빈 화면은 PNG가 거의 압축된다. 파일 크기 하한이 "렌더는 됐지만 내용이 없는"
        // 캡처를 걸러내는 가장 싼 신호다(실측 정상 캡처 60KB~400KB).
        const bytes = statSync(path).size;
        if (bytes < MIN_IMAGE_BYTES) {
          throw new Error(`캡처가 비어 보입니다 (${target.name}, ${Math.round(bytes / 1024)}KB < ${MIN_IMAGE_BYTES / 1024}KB)`);
        }
        images.push({ name: target.name, path });
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
