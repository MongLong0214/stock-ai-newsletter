/**
 * 네이버 검색광고 API 클라이언트 (읽기 전용 — 키워드도구만 사용)
 *
 * DataLab이 주는 상대 관심도와 달리 여기서는 절대 월간 검색수를 얻는다.
 * "이 키워드로 글을 쓸 가치가 있나"를 판단하는 유일한 공식 절대값 소스다.
 * 블로그 파이프라인(검색량 게이트)과 scripts/naver-ad가 공유한다.
 *
 * 자격증명은 광고 계정에 대한 쓰기 권한도 포함하므로 이 클라이언트는
 * 조회 엔드포인트만 노출한다. 캠페인 변경 API는 의도적으로 감싸지 않는다.
 */

import { createHmac } from 'node:crypto';

const BASE_URL = 'https://api.searchad.naver.com';

/** 키워드도구가 한 요청에 받는 힌트 키워드 상한. */
export const HINT_KEYWORD_LIMIT = 5;

export interface KeywordVolume {
  /** PC + 모바일 합계. 네이버가 '< 10'을 문자열로 주는 구간은 0으로 본다. */
  readonly total: number;
  readonly keyword: string;
  readonly mobile: number;
  readonly pc: number;
}

export interface SearchAdCredentials {
  readonly apiKey: string;
  readonly customerId: string;
  readonly secretKey: string;
}

/** process.env에서 자격증명을 읽는다 (GitHub Actions 등 서버 환경용). 없으면 null. */
export function credentialsFromEnv(): SearchAdCredentials | null {
  // 시크릿 3개 대신 JSON 하나로도 받는다: {"customerId":"...","apiKey":"...","secretKey":"..."}
  const bundled = process.env.NAVER_AD_CREDS;
  if (bundled) {
    try {
      const parsed = JSON.parse(bundled) as Partial<SearchAdCredentials>;
      if (parsed.customerId && parsed.apiKey && parsed.secretKey) {
        return { apiKey: parsed.apiKey, customerId: parsed.customerId, secretKey: parsed.secretKey };
      }
      console.warn('[SearchAd] NAVER_AD_CREDS에 customerId/apiKey/secretKey가 모두 필요합니다');
    } catch {
      console.warn('[SearchAd] NAVER_AD_CREDS가 유효한 JSON이 아닙니다');
    }
  }

  const customerId = process.env.NAVER_AD_CUSTOMER_ID;
  const apiKey = process.env.NAVER_AD_API_KEY;
  const secretKey = process.env.NAVER_AD_SECRET_KEY;
  if (!customerId || !apiKey || !secretKey) return null;
  return { apiKey, customerId, secretKey };
}

/** 네이버는 검색수가 아주 낮으면 숫자 대신 '< 10' 같은 검열값을 준다.
 * '< 10'은 0~9 범위라는 뜻이므로 10이 아니라 0으로 취급한다(보수적).
 * '1,390' 같은 천단위 구분 문자열은 숫자로 푼다. */
export function parseCount(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return 0;
  if (raw.includes('<')) return 0;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

/** X-Signature = base64(HMAC-SHA256(secret, `${timestamp}.${method}.${path}`)) */
export function sign(secretKey: string, timestamp: string, method: string, path: string): string {
  return createHmac('sha256', secretKey).update(`${timestamp}.${method}.${path}`).digest('base64');
}

export async function fetchKeywordVolumes(
  creds: SearchAdCredentials,
  keywords: readonly string[],
): Promise<KeywordVolume[]> {
  if (keywords.length === 0) return [];
  if (keywords.length > HINT_KEYWORD_LIMIT) {
    throw new Error(`힌트 키워드는 최대 ${HINT_KEYWORD_LIMIT}개입니다 (받은 값: ${keywords.length})`);
  }

  const path = '/keywordstool';
  const timestamp = Date.now().toString();
  // 네이버는 힌트 키워드에서 공백을 무시한다. 공백을 넣으면 다른 키워드로 집계된다.
  const query = new URLSearchParams({
    hintKeywords: keywords.map((k) => k.replace(/\s+/g, '')).join(','),
    showDetail: '1',
  });

  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    headers: {
      'X-API-KEY': creds.apiKey,
      'X-Customer': creds.customerId,
      'X-Signature': sign(creds.secretKey, timestamp, 'GET', path),
      'X-Timestamp': timestamp,
    },
  });

  if (!res.ok) {
    throw new Error(`검색광고 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as { keywordList?: Record<string, unknown>[] };
  return (body.keywordList ?? []).map((row) => {
    const pc = parseCount(row.monthlyPcQcCnt);
    const mobile = parseCount(row.monthlyMobileQcCnt);
    return { keyword: String(row.relKeyword), pc, mobile, total: pc + mobile };
  });
}
