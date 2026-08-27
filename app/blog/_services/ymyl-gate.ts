/**
 * YMYL(금융) 결정적 게이트 — 프롬프트가 요구하는 것을 코드가 검사한다
 *
 * 생성 프롬프트에는 "근거 제시", "과장 금지"가 있지만 코드 게이트는 낚시 제목
 * 정규식뿐이었다. 실제 발행물에서 나온 문제 — 출처 없는 통계("정부 통계에 따르면
 * 200% 급증"), 매수 단정, 근거 종목 없는 관련주 글 — 를 발행 전에 결정적으로 잡는다.
 * LLM 재검사가 아니라 정규식·DB 대조다: 싸고, 재현 가능하고, 반박 가능하다.
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { RELATED_STOCK_RE } from './cluster-guard';

/**
 * 모호 출처 인용 — 기관명 없이 통계를 주장하는 패턴.
 * 실측 사례를 그대로 잡는다: "정부 통계에 따르면 … 200% 급증", "통계에 따르면 80% 이상".
 * 구체 기관("금융감독원에 따르면", "한국거래소 자료에 따르면")은 걸리지 않는다.
 */
// (?<![가-힣] ?) — 앞에 한글(기관명)이 붙으면 구체 인용이므로 통과: "한국은행 통계에 따르면" OK.
// 문장 첫머리나 비한글 뒤의 맨몸 "통계에 따르면"류만 모호 출처로 잡는다.
const VAGUE_SOURCE_RE = /(정부\s*통계|모\s*기관|(?<![가-힣] ?)(?:한 조사|업계|통계|연구\s*결과|조사\s*결과))에\s*따르면/;

/**
 * 매수·수익 단정 — 자본시장법상 투자권유·유사투자자문 경계 표현.
 * 제목 게이트(BANNED_TITLE_PATTERNS)는 제목만 봤다. 본문도 본다.
 */
const INVESTMENT_SOLICITATION_RE =
  /(지금\s*(매수|사야|들어가)|매수\s*(추천|타이밍|적기)|목표가\s*[\d,]+원|수익률?\s*\d+\s*%\s*(보장|확실)|무조건\s*(오른다|상승)|급등\s*(예정|확실))/;

/** 자사 브랜드 표기 전부 */
const BRAND_RE = /Stock\s?Matrix|스탁매트릭스/gi;

/** 본문 브랜드 언급 상한. 라이브 실측 16/20이 본문에서 자사를 광고하고 있었고
 * 페이지 컴포넌트에 별도 CTA가 이미 있다. 본문은 1회(자연 인용 여지)까지만. */
export const BRAND_MENTION_LIMIT = 1;

/** 관련주류 글에서 실재 종목 최소 수 — 이 미만이면 근거 없는 리스트다 */
export const MIN_REAL_STOCKS_FOR_LISTICLE = 3;

export interface YmylViolation {
  readonly detail: string;
  readonly rule: 'vague-source' | 'solicitation' | 'brand-overuse' | 'ghost-stocks';
}

// 종목명 사전은 run 내내 불변이므로 1회만 로드
let stockNamesCache: Set<string> | null = null;

/** is_active 종목명 전체 (theme_stocks). 실패 시 null — 호출부가 fail-closed 처리. */
export async function loadActiveStockNames(): Promise<Set<string> | null> {
  if (stockNamesCache) return stockNamesCache;
  try {
    const supabase = getServerSupabaseClient();
    const rows = await fetchAllRows<{ name: string | null }>((from, to) =>
      supabase.from('theme_stocks').select('name').eq('is_active', true).range(from, to),
    );
    stockNamesCache = new Set(rows.map((r) => r.name?.trim()).filter((n): n is string => !!n && n.length >= 2));
    return stockNamesCache;
  } catch (error) {
    console.error('[YMYL] 종목명 로드 실패:', error);
    return null;
  }
}

/** 테스트용 캐시 초기화 */
export function resetStockNamesCache(): void {
  stockNamesCache = null;
}

/** 본문에 등장하는 실재 종목 수 */
export function countRealStocks(content: string, stockNames: ReadonlySet<string>): number {
  let count = 0;
  for (const name of stockNames) {
    if (content.includes(name)) count += 1;
  }
  return count;
}

/**
 * 발행 전 YMYL 검사. 위반이 하나라도 있으면 그 글은 발행하지 않는다 —
 * 고쳐서 재생성하는 게 아니라 그 슬롯을 비운다.
 */
export async function checkYmyl(
  content: string,
  targetKeyword: string,
): Promise<YmylViolation[]> {
  const violations: YmylViolation[] = [];

  const vague = VAGUE_SOURCE_RE.exec(content);
  if (vague) {
    violations.push({ rule: 'vague-source', detail: `모호 출처 인용: "${vague[0]}"` });
  }

  const solicit = INVESTMENT_SOLICITATION_RE.exec(content);
  if (solicit) {
    violations.push({ rule: 'solicitation', detail: `투자 권유성 단정: "${solicit[0]}"` });
  }

  const brandMentions = content.match(BRAND_RE)?.length ?? 0;
  if (brandMentions > BRAND_MENTION_LIMIT) {
    violations.push({
      rule: 'brand-overuse',
      detail: `본문 브랜드 언급 ${brandMentions}회 (상한 ${BRAND_MENTION_LIMIT})`,
    });
  }

  if (RELATED_STOCK_RE.test(targetKeyword)) {
    const stockNames = await loadActiveStockNames();
    if (!stockNames) {
      // fail-closed: 검증할 수 없으면 발행하지 않는다. YMYL 게이트는 향상 장치가 아니라 안전장치다.
      violations.push({ rule: 'ghost-stocks', detail: '종목명 사전 로드 실패 — 검증 불가로 보류' });
    } else {
      const real = countRealStocks(content, stockNames);
      if (real < MIN_REAL_STOCKS_FOR_LISTICLE) {
        violations.push({
          rule: 'ghost-stocks',
          detail: `관련주 글인데 실재 종목 ${real}개 (최소 ${MIN_REAL_STOCKS_FOR_LISTICLE})`,
        });
      }
    }
  }

  return violations;
}
