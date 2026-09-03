/**
 * 자사 사이트(stockmatrix.co.kr) 접근 헤더.
 *
 * 2026-09-01부터 사이트 전체에 Vercel 방화벽 챌린지가 걸려 있다(크롤러 비용 절감).
 * 실브라우저는 JS 챌린지를 풀고 통과하지만 `fetch`는 429 `x-vercel-mitigated: challenge`로
 * 끊긴다 — 이 때문에 9/1·9/2 자동 발행이 랭킹 조회에서 즉사했다(실측, run 33476306992·33595149143).
 *
 * 방화벽에 "이 헤더가 맞으면 챌린지 우회" 규칙을 두고 파이프라인만 그 헤더를 붙인다.
 * 비밀값은 코드에 두지 않는다.
 *
 * **네이버 에디터 브라우저 컨텍스트에는 절대 붙이지 않는다** — 우리 우회 비밀값이
 * 외부 도메인으로 나간다. 자사 도메인으로 가는 요청에만 쓴다.
 */

export const BYPASS_HEADER = 'x-stockmatrix-bypass';

/** 비밀값이 없으면 빈 객체 — 챌린지가 꺼져 있는 환경에서는 헤더 없이도 통과한다. */
export function siteBypassHeaders(): Record<string, string> {
  const secret = process.env.STOCKMATRIX_BYPASS_SECRET;
  return secret ? { [BYPASS_HEADER]: secret } : {};
}

/**
 * 429는 요청량 초과가 아니라 방화벽 챌린지다. 원문 상태코드만 던지면
 * "왜 갑자기 429?"에서 매번 다시 조사하게 된다.
 */
export function describeSiteFailure(path: string, status: number): string {
  if (status !== 429) return `${path} → ${status}`;
  return [
    `${path} → 429 (Vercel 방화벽 챌린지)`,
    process.env.STOCKMATRIX_BYPASS_SECRET
      ? `${BYPASS_HEADER} 헤더를 보냈지만 거부됐습니다 — 방화벽 우회 규칙의 비밀값과 일치하는지 확인하세요.`
      : `STOCKMATRIX_BYPASS_SECRET이 설정되지 않았습니다. 방화벽 우회 규칙의 비밀값을 넣으세요.`,
  ].join('\n');
}
