/**
 * 커버 = AI 사진 + 코드가 그린 한글 후킹 문구 (next/og = satori + resvg, 차트와 같은 엔진·폰트)
 *
 * 사진만으로는 어떤 기업·어떤 이슈인지 드러나지 않아 썸네일이 클릭을 끌지 못했다(2026-11-12).
 * 문구는 모델이 그리지 않고 코드가 폰트로 렌더링한다 — 오탈자·가짜 글자가 생기지 않는다.
 * 목록 카드는 16:9로 위아래를 잘라 내므로(1536x1024 기준 위아래 각 80px) 글자는 하단 안전 영역 안에 둔다.
 * 디자인 규칙: 그림자·글로우 없이 하단 단색 그라데이션 위에 흰 글자.
 */

import { createElement as h } from 'react';
import { ImageResponse } from 'next/og';
import { VISUAL_CONFIG } from '../_config/pipeline-config';
import { loadChartFonts } from './chart-renderer';

export interface CoverOverlay {
  /** 글 유형 (예: 소송 분석) — 빈 문자열이면 생략 */
  readonly kicker: string;
  /** 핵심 대상 + 쟁점 (예: 메디톡스 400억 소송) */
  readonly headline: string;
  /** 독자가 얻을 것 — 빈 문자열이면 생략 */
  readonly subhead: string;
}

const { width: W, height: H } = VISUAL_CONFIG.imageSize;
const PAD_X = 96;
const PAD_BOTTOM = 120;

/** 제목 길이별 글자 크기 — 두 줄 안에 들어가게 */
export function headlineFontSize(headline: string): number {
  const len = [...headline].length;
  if (len <= 10) return 112;
  if (len <= 14) return 96;
  return 84;
}

/**
 * 사진(JPEG) 위에 문구를 합성한다. sharp가 있으면 webp로 줄이고(목록 썸네일 용량),
 * 없으면 PNG 그대로 돌려준다.
 */
export async function renderCover(photoJpeg: Buffer, overlay: CoverOverlay): Promise<{ data: Buffer; ext: 'webp' | 'png' }> {
  const element = h(
    'div',
    { style: { width: W, height: H, display: 'flex', position: 'relative', fontFamily: 'Noto Sans KR' } },
    h('img', { src: `data:image/jpeg;base64,${photoJpeg.toString('base64')}`, width: W, height: H, style: { position: 'absolute', left: 0, top: 0 } }),
    h('div', {
      style: {
        position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex',
        backgroundImage: 'linear-gradient(to bottom, rgba(11,18,32,0) 28%, rgba(11,18,32,0.55) 55%, rgba(11,18,32,0.92) 100%)',
      },
    }),
    h(
      'div',
      { style: { position: 'absolute', left: PAD_X, right: PAD_X, bottom: PAD_BOTTOM, display: 'flex', flexDirection: 'column' } },
      ...(overlay.kicker ? [h('div', { style: { display: 'flex', fontSize: 36, fontWeight: 700, color: '#34d399', marginBottom: 18 } }, overlay.kicker)] : []),
      h('div', { style: { display: 'flex', fontSize: headlineFontSize(overlay.headline), fontWeight: 700, color: '#ffffff', lineHeight: 1.18, letterSpacing: '-0.02em' } }, overlay.headline),
      ...(overlay.subhead ? [h('div', { style: { display: 'flex', fontSize: 42, fontWeight: 500, color: '#e2e8f0', marginTop: 22 } }, overlay.subhead)] : []),
    ),
  );
  const png = Buffer.from(await new ImageResponse(element, { width: W, height: H, fonts: await loadChartFonts() }).arrayBuffer());
  try {
    const sharp = ((await import(/* webpackIgnore: true */ SHARP_MODULE)) as { default: SharpLike }).default;
    return { data: await sharp(png).webp({ quality: 84 }).toBuffer(), ext: 'webp' };
  } catch (error) {
    console.warn(`[Visuals] sharp 없음 — 커버를 PNG로 싣는다: ${error instanceof Error ? error.message : String(error)}`);
    return { data: png, ext: 'png' };
  }
}

/**
 * sharp는 직접 의존성이 아니다(next의 선택 의존성). npm(Actions, 파이프라인 실행처)은 최상위에 깔지만
 * pnpm(Vercel 빌드)은 숨겨 `import('sharp')` 타입 해석이 실패해 next build가 깨진다(PR #253 Preview).
 * 지정자를 변수로 둬 타입 해석·번들링 대상에서 빼고 실행 시점에만 불러온다.
 */
const SHARP_MODULE = 'sharp';
type SharpLike = (input: Buffer) => { webp(options: { quality: number }): { toBuffer(): Promise<Buffer> } };
