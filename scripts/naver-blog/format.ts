/**
 * 발행 포맷 규격 — FORMAT-SPEC.md의 코드 표현.
 *
 * 초안 생성(make-draft)과 발행(publish)이 같은 상수를 봐야 한다. publish를 직접
 * 호출하거나 오래된 draft.json을 넘기면 초안 쪽 검증을 전부 건너뛰기 때문이다.
 */

export const FORMAT = {
  bodyMax: 2500,
  bodyMin: 1500,
  minImages: 4,
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

/** 서식 마커를 걷어낸 순수 본문 길이 기준 텍스트 */
export const toPlainBody = (body: string): string => body.replace(/>> |\*\*|\[\[[rb]:|\]\]/g, '');

export interface DraftShape {
  body: string;
  images?: string[];
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
  const plain = toPlainBody(draft.body);

  if (draft.title.length < FORMAT.titleMin || draft.title.length > FORMAT.titleMax) {
    violations.push(`제목 ${draft.title.length}자 (규격 ${FORMAT.titleMin}~${FORMAT.titleMax})`);
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

  return violations;
}
