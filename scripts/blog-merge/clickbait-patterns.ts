/**
 * 낚시 제목 패턴 — 발행 게이트(content-generator.ts BANNED_TITLE_PATTERNS)와
 * 기존 글 감사에서 공유한다.
 *
 * 게이트는 2026-08-21에 추가됐고 그 이전 발행분 1,306편은 통과한 적이 없다.
 * 실측: 현행 게이트 기준 400편(30.6%), 확장 패턴 포함 566편(43.3%)이 위반.
 */

/** content-generator.ts의 발행 게이트와 동일 */
export const GATE_PATTERNS: readonly RegExp[] = [
  /모르면/,
  /고점에\s*물/,
  /확률\s*\d+\s*%/,
  /아직도.*(하시나요|보시나요|계신가요)/,
  /나만\s*손해/,
  /안\s*보면/,
  /지금\s*아니면/,
  /충격/,
  /(?:^|\s)썰(?:\s|$|\.)/,
  /후회/,
];

/** 게이트에는 없지만 실측 제목에서 반복 확인된 낚시 패턴 */
export const EXTRA_PATTERNS: readonly RegExp[] = [
  /남들\s*다/,
  /(날렸|잃었)습니다/,
  /물(립니다|리지|힙니다)/,
  /놓치면/,
  /(소외됩니다|구경만)/,
  /수익\s*0원/,
  /(의 비밀|진짜 이유)/,
];

export const ALL_PATTERNS: readonly RegExp[] = [...GATE_PATTERNS, ...EXTRA_PATTERNS];

export function isClickbait(title: string): boolean {
  return ALL_PATTERNS.some((re) => re.test(title));
}
