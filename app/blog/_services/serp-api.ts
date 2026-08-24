/** Serper.dev 구글 검색 결과 수집 서비스 (SerpApi 대체) */

import { SERP_API_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import type { SerperResponse, SerpSearchResult } from '../_types/blog';

/** 텍스트 콘텐츠 스크래핑이 불가능한 도메인 */
const EXCLUDED_DOMAINS = [
  'youtube.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'naver.me',
];

/** API 키 검증 (Serper.dev) */
function validateApiKey(): string {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/** Serper organic 결과를 내부 SerpSearchResult 형태로 변환 */
function toSearchResults(response: SerperResponse): SerpSearchResult[] {
  return (response.organic ?? []).map((item, index) => ({
    position: item.position ?? index + 1,
    title: item.title ?? '',
    link: item.link,
    snippet: item.snippet ?? '',
    displayed_link: item.link,
  }));
}

/** 소셜미디어/동영상 플랫폼 등 분석 부적합 도메인 필터링 */
function filterSearchResults(results: SerpSearchResult[]): SerpSearchResult[] {
  return results.filter((result) => {
    const url = result.link.toLowerCase();
    return !EXCLUDED_DOMAINS.some((domain) => url.includes(domain));
  });
}

/**
 * 구글 검색 결과 수집 (Serper.dev, 재시도 포함)
 * @param keyword - 검색 키워드
 * @param maxResults - 최대 결과 수 (기본: PIPELINE_CONFIG.maxCompetitors)
 * @returns 필터링된 검색 결과 배열
 */
export async function searchGoogle(
  keyword: string,
  maxResults: number = PIPELINE_CONFIG.maxCompetitors
): Promise<SerpSearchResult[]> {
  console.log(`[Serper] "${keyword}" 검색 시작`);

  const apiKey = validateApiKey();

  let lastError: Error | null = null;
  let response: SerperResponse | null = null;

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PIPELINE_CONFIG.requestTimeout);

      try {
        const res = await fetch(SERP_API_CONFIG.baseUrl, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: keyword,
            gl: SERP_API_CONFIG.gl,
            hl: SERP_API_CONFIG.hl,
            num: SERP_API_CONFIG.num,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`Serper 오류 (${res.status}): ${errorBody}`);
        }

        response = (await res.json()) as SerperResponse;
        break;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < PIPELINE_CONFIG.retryAttempts) {
        const delay = PIPELINE_CONFIG.retryDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!response) {
    throw lastError || new Error('Serper 호출 실패');
  }

  if (!response.organic || response.organic.length === 0) {
    console.warn('[Serper] 검색 결과 없음');
    return [];
  }

  const limitedResults = filterSearchResults(toSearchResults(response)).slice(0, maxResults);
  console.log(`[Serper] ${limitedResults.length}개 결과 수집 완료`);

  return limitedResults;
}
