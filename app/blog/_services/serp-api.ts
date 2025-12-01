/**
 * SerpApi 검색 결과 수집 서비스
 * 구글 검색 상위 결과를 수집하여 경쟁사 분석에 활용
 */

import { SERP_API_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import { fetchWithTimeout, withRetry } from '../_utils/fetch-helpers';
import type { SerpApiResponse, SerpSearchResult } from '../_types/blog';

/**
 * SerpApi 환경변수 검증
 */
function validateApiKey(): string {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    throw new Error('SERP_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/**
 * SerpApi URL 생성
 */
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

/**
 * 검색 결과 필터링 (광고, 소셜미디어 등 제외)
 */
function filterSearchResults(results: SerpSearchResult[]): SerpSearchResult[] {
  const excludedDomains = [
    'youtube.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'naver.me', // 네이버 단축 URL
  ];

  return results.filter((result) => {
    const url = result.link.toLowerCase();
    return !excludedDomains.some((domain) => url.includes(domain));
  });
}

/**
 * 구글 검색 결과 수집
 *
 * @param keyword - 검색 키워드
 * @param maxResults - 최대 결과 수 (기본: 5)
 * @returns 검색 결과 배열
 */
export async function searchGoogle(
  keyword: string,
  maxResults: number = PIPELINE_CONFIG.maxCompetitors
): Promise<SerpSearchResult[]> {
  console.log(`\n🔍 [SerpApi] "${keyword}" 검색 시작...`);

  const apiKey = validateApiKey();
  const url = buildSearchUrl(keyword, apiKey);

  const response = await withRetry(
    async () => {
      const res = await fetchWithTimeout(
        url,
        { method: 'GET' },
        PIPELINE_CONFIG.requestTimeout
      );

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`SerpApi 오류 (${res.status}): ${errorBody}`);
      }

      return res.json() as Promise<SerpApiResponse>;
    },
    PIPELINE_CONFIG.retryAttempts,
    PIPELINE_CONFIG.retryDelay
  );

  if (!response.organic_results || response.organic_results.length === 0) {
    console.warn('⚠️ [SerpApi] 검색 결과 없음');
    return [];
  }

  const filteredResults = filterSearchResults(response.organic_results);
  const limitedResults = filteredResults.slice(0, maxResults);

  console.log(`✅ [SerpApi] ${limitedResults.length}개 결과 수집 완료`);
  limitedResults.forEach((result, idx) => {
    console.log(`   ${idx + 1}. ${result.title.slice(0, 50)}...`);
  });

  return limitedResults;
}

/**
 * 여러 키워드에 대한 검색 결과 수집 (배치)
 *
 * @param keywords - 검색 키워드 배열
 * @param maxResultsPerKeyword - 키워드당 최대 결과 수
 * @returns 키워드별 검색 결과 맵
 */
export async function searchGoogleBatch(
  keywords: string[],
  maxResultsPerKeyword: number = 3
): Promise<Map<string, SerpSearchResult[]>> {
  console.log(`\n📦 [SerpApi] 배치 검색 시작 (${keywords.length}개 키워드)`);

  const results = new Map<string, SerpSearchResult[]>();

  // 순차 실행 (Rate limit 방지)
  for (const keyword of keywords) {
    try {
      const searchResults = await searchGoogle(keyword, maxResultsPerKeyword);
      results.set(keyword, searchResults);

      // Rate limit 방지를 위한 딜레이
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ [SerpApi] "${keyword}" 검색 실패:`, error);
      results.set(keyword, []);
    }
  }

  console.log(`✅ [SerpApi] 배치 검색 완료`);
  return results;
}

/**
 * SerpApi 무료 플랜 사용량 확인
 * (250회/월 제한)
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

    return {
      used: data.this_month_usage || 0,
      remaining: (data.plan_searches_left || 250) - (data.this_month_usage || 0),
      limit: data.plan_searches_left || 250,
    };
  } catch (error) {
    console.warn('⚠️ [SerpApi] 사용량 조회 실패:', error);
    return { used: 0, remaining: 250, limit: 250 };
  }
}