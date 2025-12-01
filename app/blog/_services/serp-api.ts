/**
 * SerpApi 검색 결과 수집 서비스
 *
 * [이 파일의 역할]
 * - 구글 검색 결과를 API로 가져오는 기능 제공
 * - 경쟁사 콘텐츠 분석의 첫 단계
 *
 * [SerpApi란?]
 * - Search Engine Results Page API
 * - 구글, 빙, 야후 등의 검색 결과를 JSON으로 제공하는 유료 서비스
 * - 직접 크롤링하면 IP 차단 위험이 있어 API 사용
 *
 * [무료 플랜 제한]
 * - 월 100회 검색 가능 (2024년 기준)
 * - 초과 시 요금 발생
 * - checkApiUsage()로 사용량 확인 가능
 *
 * [사용 흐름]
 * 1. 타겟 키워드로 구글 검색
 * 2. 상위 5개 결과 URL 추출
 * 3. 각 URL을 web-scraper로 스크래핑
 * 4. 경쟁사 콘텐츠 분석에 활용
 */

import { SERP_API_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import { fetchWithTimeout, withRetry } from '../_utils/fetch-helpers';
import type { SerpApiResponse, SerpSearchResult } from '../_types/blog';

/**
 * SerpApi API 키 검증
 *
 * [환경변수 설정 방법]
 * 1. SerpApi 가입 (https://serpapi.com)
 * 2. Dashboard에서 API Key 복사
 * 3. .env.local에 SERP_API_KEY=your_api_key 추가
 *
 * @returns 유효한 API 키
 * @throws API 키가 설정되지 않은 경우 에러
 */
function validateApiKey(): string {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    throw new Error('SERP_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  return apiKey;
}

/**
 * SerpApi 검색 URL 생성
 *
 * [URL 파라미터 설명]
 * - api_key: 인증 키
 * - engine: 검색엔진 (google)
 * - q: 검색 쿼리 (키워드)
 * - location: 검색 위치 (서울, 대한민국)
 * - hl: 언어 (ko = 한국어)
 * - gl: 국가 코드 (kr = 한국)
 * - google_domain: 구글 도메인 (google.co.kr)
 * - num: 결과 개수
 *
 * @param keyword - 검색할 키워드
 * @param apiKey - SerpApi API 키
 * @returns 완성된 API 요청 URL
 */
function buildSearchUrl(keyword: string, apiKey: string): string {
  // URLSearchParams: URL 쿼리 스트링을 안전하게 생성
  // - 특수문자 자동 인코딩 (예: 공백 → %20)
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

  // 기본 URL + 쿼리 파라미터 조합
  return `${SERP_API_CONFIG.baseUrl}?${params.toString()}`;
}

/**
 * 검색 결과 필터링 (광고, 소셜미디어 등 제외)
 *
 * [필터링이 필요한 이유]
 * - 소셜미디어 링크는 콘텐츠 분석에 부적합
 * - YouTube 영상은 텍스트 스크래핑 불가
 * - 블로그/뉴스 형태의 텍스트 콘텐츠만 분석
 *
 * [제외되는 도메인]
 * - youtube.com: 동영상 플랫폼
 * - twitter.com, facebook.com, instagram.com: 소셜 미디어
 * - tiktok.com: 숏폼 동영상
 * - naver.me: 네이버 단축 URL (리다이렉트 문제)
 *
 * @param results - SerpApi에서 받은 원본 검색 결과
 * @returns 필터링된 검색 결과
 */
function filterSearchResults(results: SerpSearchResult[]): SerpSearchResult[] {
  // 제외할 도메인 목록
  const excludedDomains = [
    'youtube.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'tiktok.com',
    'naver.me', // 네이버 단축 URL
  ];

  // 제외 도메인이 포함된 URL 필터링
  return results.filter((result) => {
    const url = result.link.toLowerCase();
    // some(): 하나라도 조건에 맞으면 true → 그 결과를 제외
    return !excludedDomains.some((domain) => url.includes(domain));
  });
}

/**
 * 구글 검색 결과 수집
 *
 * [실행 흐름]
 * 1. API 키 검증
 * 2. 검색 URL 생성
 * 3. API 호출 (재시도 로직 포함)
 * 4. 결과 필터링 (소셜미디어 제외)
 * 5. 지정된 개수만큼 반환
 *
 * [에러 처리]
 * - API 키 없음 → 에러 throw
 * - 네트워크 오류 → 최대 3회 재시도
 * - 검색 결과 없음 → 빈 배열 반환
 *
 * @param keyword - 검색 키워드 (예: "주식 뉴스레터 추천")
 * @param maxResults - 최대 결과 수 (기본: 5개)
 * @returns 검색 결과 배열 (title, link, snippet 포함)
 *
 * @example
 * const results = await searchGoogle('주식 뉴스레터 추천');
 * // [
 * //   { title: '2024년 최고의 주식 뉴스레터', link: 'https://...', ... },
 * //   { title: '주식 투자 정보 구독 추천', link: 'https://...', ... },
 * //   ...
 * // ]
 */
export async function searchGoogle(
  keyword: string,
  maxResults: number = PIPELINE_CONFIG.maxCompetitors
): Promise<SerpSearchResult[]> {
  console.log(`\n🔍 [SerpApi] "${keyword}" 검색 시작...`);

  // 1. API 키 검증
  const apiKey = validateApiKey();
  // 2. 검색 URL 생성
  const url = buildSearchUrl(keyword, apiKey);

  // 3. API 호출 (재시도 로직 포함)
  // withRetry: 실패 시 exponential backoff로 재시도
  const response = await withRetry(
    async () => {
      // fetchWithTimeout: 타임아웃 적용된 fetch
      const res = await fetchWithTimeout(
        url,
        { method: 'GET' },
        PIPELINE_CONFIG.requestTimeout
      );

      // HTTP 상태 코드 확인
      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`SerpApi 오류 (${res.status}): ${errorBody}`);
      }

      // JSON 파싱
      return await res.json() as Promise<SerpApiResponse>;
    },
    PIPELINE_CONFIG.retryAttempts, // 재시도 횟수 (기본 3회)
    PIPELINE_CONFIG.retryDelay // 재시도 간격 (기본 2초)
  );

  // 4. 검색 결과 확인
  if (!response.organic_results || response.organic_results.length === 0) {
    console.warn('⚠️ [SerpApi] 검색 결과 없음');
    return [];
  }

  // 5. 필터링 및 개수 제한
  const filteredResults = filterSearchResults(response.organic_results);
  const limitedResults = filteredResults.slice(0, maxResults);

  // 6. 결과 로깅
  console.log(`✅ [SerpApi] ${limitedResults.length}개 결과 수집 완료`);
  limitedResults.forEach((result, idx) => {
    // 제목이 너무 길면 50자까지만 표시
    console.log(`   ${idx + 1}. ${result.title.slice(0, 50)}...`);
  });

  return limitedResults;
}

/**
 * SerpApi 사용량 확인
 *
 * [왜 사용량을 확인하나?]
 * - 무료 플랜은 월 100회 제한
 * - 초과 시 요금 발생 또는 차단
 * - 파이프라인 실행 전 사용량 체크 권장
 *
 * [반환 데이터]
 * - used: 이번 달 사용한 횟수
 * - remaining: 남은 횟수
 * - limit: 월간 총 한도
 *
 * @returns 사용량 정보 객체
 *
 * @example
 * const usage = await checkApiUsage();
 * if (usage.remaining < 10) {
 *   console.warn('API 사용량이 얼마 남지 않았습니다!');
 * }
 */
export async function checkApiUsage(): Promise<{
  used: number;
  remaining: number;
  limit: number;
}> {
  const apiKey = validateApiKey();

  try {
    // SerpApi 계정 정보 조회 API
    const response = await fetch(
      `https://serpapi.com/account.json?api_key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`API 사용량 조회 실패: ${response.status}`);
    }

    const data = await response.json();

    return {
      // 이번 달 사용량
      used: data.this_month_usage || 0,
      // 남은 횟수 = 전체 한도 - 사용량
      remaining: (data.plan_searches_left || 250) - (data.this_month_usage || 0),
      // 플랜 한도
      limit: data.plan_searches_left || 250,
    };
  } catch (error) {
    // API 호출 실패 시 기본값 반환 (서비스 중단 방지)
    console.warn('⚠️ [SerpApi] 사용량 조회 실패:', error);
    return { used: 0, remaining: 250, limit: 250 };
  }
}