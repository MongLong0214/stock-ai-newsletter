/**
 * 발행 포맷 규격 — FORMAT-SPEC.md의 코드 표현.
 *
 * 초안 생성(make-draft)과 발행(publish)이 같은 상수를 봐야 한다. publish를 직접
 * 호출하거나 오래된 draft.json을 넘기면 초안 쪽 검증을 전부 건너뛰기 때문이다.
 */

import {
  countBold,
  countColor,
  countQuotes,
  firstSentence,
  stripFormat,
  titleKeyword,
  type ImagePlacement,
} from './draft-model';

export const FORMAT = {
  bodyMax: 2500,
  bodyMin: 1500,
  bodyRecommendedMax: 2200,
  bodyRecommendedMin: 1800,
  boldMax: 20,
  boldMin: 10,
  maxImages: 7,
  minImages: 4,
  quoteMax: 5,
  quoteMin: 3,
  tagsMax: 12,
  tagsMin: 8,
  titleMax: 45,
  titleMin: 25,
} as const;

/** 인용구 박스(소제목) 표시. publish.ts가 이 접두를 보고 스마트에디터 인용구로 변환한다. */
export const QUOTE_PREFIX = '>> ';

/** outside 링크로 허용하는 호스트 — 초안이 임의 도메인으로 유도하지 못하게 한다 */
export const ALLOWED_OUTSIDE_HOSTS = ['stockmatrix.co.kr', 'www.stockmatrix.co.kr'] as const;

/** YMYL 고지문. 이 문장이 없는 글은 발행하지 않는다. */
export const DISCLAIMER_MARKER = '투자 판단과 그 결과는';

export const METHODOLOGY_PATH = '/themes/methodology';

const FORBIDDEN_PHRASE_RE = /테마 전망|독자적 흐름 가능성|상승 가능성|지금 매수|매수하세요|매도하세요|추천합니다/;

/** 서식 마커를 걷어낸 순수 본문 길이 기준 텍스트 */
export const toPlainBody = (body: string): string => stripFormat(body);

export interface DraftShape {
  body: string;
  imagePlacements?: ImagePlacement[];
  images?: string[];
  meta?: { postType?: string; sourceSnapshot?: { change7d?: number; score?: number } };
  outsideUrl?: string;
  tags?: string[];
  themeId?: string;
  title: string;
}

/**
 * FORMAT-SPEC 위반 목록. 빈 배열이면 통과.
 *
 * `fileExists`를 주입받는 이유: 초안 생성 시점에는 아직 파일이 없을 수도 있는 반면
 * 발행 시점에는 반드시 존재해야 한다 — 호출부가 정한다.
 */
export function checkFormat(
  draft: DraftShape,
  opts: { fileExists?: (path: string) => boolean } = {},
): string[] {
  const violations: string[] = [];

  // JSON에서 읽어 들인 값은 타입 선언과 다를 수 있다. .length만 보면 문자열
  // `tags: "테마주주식뉴스"`가 태그 8개로 통과하고, 발행기가 글자 하나씩 태그로 입력한다.
  if (typeof draft.title !== 'string') violations.push('title이 문자열이 아님');
  if (typeof draft.body !== 'string') violations.push('body가 문자열이 아님');
  if (draft.tags !== undefined && (!Array.isArray(draft.tags) || draft.tags.some((t) => typeof t !== 'string'))) {
    violations.push('tags가 문자열 배열이 아님');
  }
  if (draft.images !== undefined && (!Array.isArray(draft.images) || draft.images.some((p) => typeof p !== 'string'))) {
    violations.push('images가 문자열 배열이 아님');
  }
  // 타입이 깨졌으면 이후 길이·내용 검사는 의미가 없다
  if (violations.length) return violations;
  const plain = toPlainBody(draft.body);

  if (draft.title.length < FORMAT.titleMin || draft.title.length > FORMAT.titleMax) {
    violations.push(`제목 ${draft.title.length}자 (규격 ${FORMAT.titleMin}~${FORMAT.titleMax})`);
  }
  if (!/\d/.test(draft.title)) {
    violations.push('제목에 숫자가 없음');
  }
  if (plain.length < FORMAT.bodyMin || plain.length > FORMAT.bodyMax) {
    violations.push(`본문 ${plain.length}자 (규격 ${FORMAT.bodyMin}~${FORMAT.bodyMax})`);
  }
  const tagCount = draft.tags?.length ?? 0;
  if (tagCount < FORMAT.tagsMin || tagCount > FORMAT.tagsMax) {
    violations.push(`태그 ${tagCount}개 (규격 ${FORMAT.tagsMin}~${FORMAT.tagsMax})`);
  }
  const imageCount = draft.images?.length ?? 0;
  if (imageCount < FORMAT.minImages) {
    violations.push(`이미지 ${imageCount}장 (최소 ${FORMAT.minImages})`);
  }
  if (imageCount > FORMAT.maxImages) {
    violations.push(`이미지 ${imageCount}장 (최대 ${FORMAT.maxImages})`);
  }
  if (!plain.includes(DISCLAIMER_MARKER)) {
    violations.push('YMYL 고지문 없음');
  }
  if (draft.outsideUrl) {
    let host = '';
    try {
      host = new URL(draft.outsideUrl).host;
    } catch {
      violations.push(`outsideUrl이 URL 형식이 아님: ${draft.outsideUrl}`);
    }
    if (host && !ALLOWED_OUTSIDE_HOSTS.includes(host as (typeof ALLOWED_OUTSIDE_HOSTS)[number])) {
      violations.push(`허용되지 않은 outside 호스트: ${host}`);
    }
  }
  if (opts.fileExists) {
    const missing = (draft.images ?? []).filter((p) => !opts.fileExists!(p));
    if (missing.length) violations.push(`이미지 파일 없음: ${missing.join(', ')}`);
  }

  const quotes = countQuotes(draft.body);
  if (quotes < FORMAT.quoteMin || quotes > FORMAT.quoteMax) {
    violations.push(`인용구 ${quotes}개 (규격 ${FORMAT.quoteMin}~${FORMAT.quoteMax})`);
  }
  const bolds = countBold(draft.body);
  if (bolds < FORMAT.boldMin || bolds > FORMAT.boldMax) {
    violations.push(`볼드 ${bolds}회 (규격 ${FORMAT.boldMin}~${FORMAT.boldMax})`);
  }

  const keyword = titleKeyword(draft.title);
  if (keyword && !firstSentence(draft.body).includes(keyword)) {
    violations.push(`첫 문장에 목표 키워드 없음 (기대: "${keyword}")`);
  }

  const withoutDisclaimer = plain.replace(/특정 종목의 매수·매도를 권하는 것이 아니며[^.]*\./g, '');
  if (FORBIDDEN_PHRASE_RE.test(withoutDisclaimer)) {
    violations.push('전망·추천·매수매도 권유 문구');
  }

  const placements = draft.imagePlacements ?? [];
  if (placements.length) {
    const missingCaption = placements.filter((item) => !item.caption.trim());
    if (missingCaption.length) violations.push(`이미지 캡션 없음: ${missingCaption.map((i) => i.id).join(', ')}`);
    const excluded = placements.filter((item) => /outlook|pattern/.test(item.id) && draft.meta?.postType !== 'similar');
    if (excluded.length && (draft.meta?.postType === 'theme' || !draft.meta?.postType)) {
      violations.push(`theme 글에 전망·유사패턴 이미지: ${excluded.map((i) => i.id).join(', ')}`);
    }
  }

  const snap = draft.meta?.sourceSnapshot;
  const postType = draft.meta?.postType ?? 'theme';

  // 드리프트 가드는 **본문이 실제로 그 수치를 서술하는 유형**에만 적용한다.
  // theme 본문은 "최근 7일 변화"를 쓰지만 similar 본문은 유사도·사이클 일수·점수를 쓴다.
  // 전 유형에 요구하면 similar 글이 매번 "change7d가 없음"으로 반려되어
  // 7일 로테이션 중 1일이 항상 발행 0건이 된다(실측).
  if (postType === 'theme' && snap?.change7d != null && !plain.includes(String(Math.abs(snap.change7d)))) {
    violations.push(`본문에 스냅샷 change7d(${snap.change7d})가 없음`);
  }
  // 점수는 모든 개별 테마 유형이 서술한다 — 드리프트 가드를 여기로 옮긴다.
  if (
    (postType === 'theme' || postType === 'similar' || postType === 'news')
    && snap?.score != null
    && !plain.includes(String(snap.score))
  ) {
    violations.push(`본문에 스냅샷 score(${snap.score})가 없음`);
  }

  if (
    postType === 'theme'
    && countColor(draft.body) === 0
    && (snap?.change7d ?? 0) !== 0
  ) {
    violations.push('방향 데이터가 있는데 색상 마커가 없음');
  }

  return violations;
}
