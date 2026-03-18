/** SerpApi 구글 검색 결과 수집 서비스 */

import { SERP_API_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import type { SerpApiResponse, SerpSearchResult } from '../_types/blog';

/** 텍스트 콘텐츠 스크래핑이 불가능한 도메인 */
const EXCLUDED_DOMAINS = [
  'youtube.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'naver.me',
];

/** API 키 검증 */
function validateApiKey(): string {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    throw new Error('SERP_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/** 검색 URL 생성 */
function buildSearchUrl(keyword: string, apiKey: string): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    engine: SERP_API_CONFIG.engine,
    q: keyword,
    location: SERP_API_CONFIG.location,
    hl: SERP_API_CONFIG.hl,
    gl: SERP_API_CONFIG.gl,
    google_domain: SERP_API_CONFIG.googleDomain,
    num: String(SERP_API_CONFIG.num),
  });

  return `${SERP_API_CONFIG.baseUrl}?${params.toString()}`;
}

/** 소셜미디어/동영상 플랫폼 등 분석 부적합 도메인 필터링 */
function filterSearchResults(results: SerpSearchResult[]): SerpSearchResult[] {
  return results.filter((result) => {
    const url = result.link.toLowerCase();
    return !EXCLUDED_DOMAINS.some((domain) => url.includes(domain));
  });
}

/**
 * 구글 검색 결과 수집 (재시도 포함)
 * @param keyword - 검색 키워드
 * @param maxResults - 최대 결과 수 (기본: PIPELINE_CONFIG.maxCompetitors)
 * @returns 필터링된 검색 결과 배열
 */
export async function searchGoogle(
  keyword: string,
  maxResults: number = PIPELINE_CONFIG.maxCompetitors
): Promise<SerpSearchResult[]> {
  console.log(`[SerpApi] "${keyword}" 검색 시작`);

  const apiKey = validateApiKey();
  const url = buildSearchUrl(keyword, apiKey);

  let lastError: Error | null = null;
  let response: SerpApiResponse | null = null;

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.retryAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PIPELINE_CONFIG.requestTimeout);

      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`SerpApi 오류 (${res.status}): ${errorBody}`);
        }

        response = await res.json() as SerpApiResponse;

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
    throw lastError || new Error('SerpApi 호출 실패');
  }

  if (!response.organic_results || response.organic_results.length === 0) {
    console.warn('[SerpApi] 검색 결과 없음');
    return [];
  }

  const limitedResults = filterSearchResults(response.organic_results).slice(0, maxResults);
  console.log(`[SerpApi] ${limitedResults.length}개 결과 수집 완료`);

  return limitedResults;
}

/**
 * SerpApi 사용량 확인
 * @returns used(이번 달 사용량), remaining(남은 횟수), limit(플랜 한도)
 */
export async function checkApiUsage(): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  const apiKey = validateApiKey();

  try {
    const response = await fetch(
      `https://serpapi.com/account.json?api_key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`API 사용량 조회 실패: ${response.status}`);
    }

    const data = await response.json();

    // TODO: plan_searches_left가 "남은 횟수"인지 "총 한도"인지 SerpApi 문서에서 명확하지 않음.
    //       현재는 "총 한도"로 간주하고 used를 빼서 remaining을 계산.
    //       실제 의미가 "남은 횟수"라면 remaining = plan_searches_left로 변경 필요.
    return {
      used: data.this_month_usage || 0,
      remaining: (data.plan_searches_left || 250) - (data.this_month_usage || 0),
      limit: data.plan_searches_left || 250,
    };
  } catch (error) {
    // 사용량 조회 실패해도 서비스 중단 방지
    console.warn('[SerpApi] 사용량 조회 실패:', error);
    return { used: 0, remaining: 250, limit: 250 };
  }
}
