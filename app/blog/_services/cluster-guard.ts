/**
 * 테마 클러스터 가드 — 같은 실체어 클러스터의 재발행을 전 기간 대비로 차단
 *
 * 배경: "스테이블코인 관련주" 20편, "토스 관련주" 6편이 발행됐고 site: 검색으로도
 * 구글이 승자를 못 고른다. 원인은 세 겹이었다 — target_keyword 중복 검사가 90일
 * 윈도로 만료되고, keyword-similarity의 고유실체어 안전장치가 "토스 관련주" vs
 * "토스 상장 관련주"를 다른 주제로 판정하고, 프롬프트가 같은 테마 3개까지 허용한다.
 *
 * 이 가드는 수식어(관련주·수혜주·전망…)와 연도·수량을 벗긴 실체어 집합을 키로,
 * 부분집합 관계면 같은 클러스터로 본다. 기간 만료는 없다 — 같은 클러스터 글은
 * 새 URL이 아니라 기존 글 갱신이어야 한다.
 */

import { MODIFIER_WORDS, STOP_WORDS } from '../_config/keyword-dictionaries';

/** 연도(2024·2025년…), 수량(5종목·TOP7·3가지…) — 클러스터 정체성이 아니다 */
const NOISE_RE = /20\d{2}년?|\d+\s*(종목|가지|개|선|위)|top\s*\d*/gi;

/** 수식어를 벗기고 남는 실체어 집합. 비어 있으면 클러스터 판정 불가(null). */
export function extractClusterEntities(keyword: string): Set<string> | null {
  const cleaned = keyword.toLowerCase().replace(NOISE_RE, ' ').replace(/[^가-힣a-z0-9\s]/g, ' ');
  const entities = new Set<string>();
  for (const word of cleaned.split(/\s+/)) {
    if (word.length < 2) continue;
    if (STOP_WORDS.has(word) || MODIFIER_WORDS.has(word)) continue;
    entities.add(word);
  }
  return entities.size > 0 ? entities : null;
}

/** 접두 매칭: "토스"와 "토스뱅크"는 같은 클러스터의 변주로 본다. */
function entityMatches(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** A의 모든 실체어가 B에서 (접두 매칭으로) 커버되는가 */
function isCoveredBy(a: Set<string>, b: Set<string>): boolean {
  for (const ea of a) {
    let hit = false;
    for (const eb of b) {
      if (entityMatches(ea, eb)) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}

/** 관련주류 패턴 — 클러스터 가드는 여기에만 적용한다.
 * 일반 교육 주제("RSI 활용법")까지 실체어 부분집합으로 막으면 과차단이 된다
 * (RSI 글 하나가 RSI 주제 전체를 영구 차단). 관련주 리스트는 성격이 다르다 —
 * 같은 테마의 관련주 글은 새 URL이 아니라 기존 글 갱신이어야 한다. */
export const RELATED_STOCK_RE = /관련주|수혜주|대장주|테마주/;

/**
 * 새 키워드가 기존 키워드 중 하나와 같은 관련주 클러스터인가.
 * 양쪽 다 관련주류일 때만 판정하며, 실체어 집합이 부분집합 관계(어느 쪽이든)면 같다:
 *   "토스" ⊆ {토스, 상장}          → 차단 (토스 관련주 vs 토스 상장 관련주)
 *   {삼성전자, per} vs {네이버, per} → 통과 (서로 부분집합 아님)
 */
export function isSameCluster(newKeyword: string, existingKeyword: string): boolean {
  if (!RELATED_STOCK_RE.test(newKeyword) || !RELATED_STOCK_RE.test(existingKeyword)) return false;
  const a = extractClusterEntities(newKeyword);
  const b = extractClusterEntities(existingKeyword);
  if (!a || !b) return false;
  return isCoveredBy(a, b) || isCoveredBy(b, a);
}

/** 기존 키워드 목록에서 같은 클러스터를 찾는다. 없으면 null. */
export function findClusterCollision(
  newKeyword: string,
  existingKeywords: readonly string[],
): string | null {
  for (const existing of existingKeywords) {
    if (isSameCluster(newKeyword, existing)) return existing;
  }
  return null;
}
