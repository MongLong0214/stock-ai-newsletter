/**
 * HTTP 요청 유틸리티 함수
 *
 * [이 파일의 역할]
 * - 안전한 HTTP 요청을 위한 헬퍼 함수 제공
 * - 타임아웃, 재시도 로직 등 공통 기능 제공
 *
 * [왜 이런 유틸리티가 필요한가?]
 * - 외부 API 호출 시 네트워크 오류, 서버 오류 등이 발생할 수 있음
 * - 타임아웃이 없으면 요청이 무한정 대기할 수 있음
 * - 재시도 로직으로 일시적 오류 복구 가능
 */

/** 기본 타임아웃: 30초 */
const DEFAULT_TIMEOUT = 30000;

/** 기본 재시도 횟수: 3회 */
const DEFAULT_RETRIES = 3;

/** 기본 재시도 대기 시간: 2초 */
const DEFAULT_DELAY = 2000;

/**
 * 타임아웃이 적용된 fetch 함수
 *
 * [일반 fetch와의 차이점]
 * - 일반 fetch: 서버가 응답할 때까지 무한 대기 가능
 * - fetchWithTimeout: 지정 시간 초과 시 자동으로 요청 취소
 *
 * [동작 원리]
 * 1. AbortController로 취소 가능한 요청 생성
 * 2. setTimeout으로 타임아웃 타이머 설정
 * 3. 타임아웃 전에 응답 오면 정상 반환
 * 4. 타임아웃 발생 시 abort()로 요청 취소
 *
 * @param url - 요청할 URL
 * @param options - fetch 옵션 (method, headers 등)
 * @param timeout - 타임아웃 시간 (밀리초, 기본 30초)
 * @returns Promise<Response>
 *
 * @example
 * const response = await fetchWithTimeout('https://api.example.com', {}, 5000);
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = DEFAULT_TIMEOUT
): Promise<Response> {
  // AbortController: fetch 요청을 중간에 취소할 수 있게 해주는 웹 API
  const controller = new AbortController();

  // 타임아웃 시간 후 abort() 호출하여 요청 취소
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // signal을 전달하면 abort() 시 요청이 취소됨
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    // 성공/실패 상관없이 타이머 정리 (메모리 누수 방지)
    clearTimeout(timeoutId);
  }
}

/**
 * 재시도 로직이 포함된 비동기 함수 실행기
 *
 * [사용 목적]
 * - 네트워크 일시적 오류 시 자동 재시도
 * - 서버 과부하 시 잠시 후 재시도
 * - Exponential Backoff: 재시도마다 대기 시간 2배 증가
 *
 * [Exponential Backoff 설명]
 * - 1차 재시도: 2초 대기
 * - 2차 재시도: 4초 대기
 * - 3차 재시도: 8초 대기
 * - 서버 부하를 줄이고 성공 확률 높임
 *
 * @param fn - 실행할 비동기 함수
 * @param retries - 최대 재시도 횟수 (기본 3회)
 * @param delay - 기본 대기 시간 (기본 2초)
 * @returns 함수 실행 결과
 *
 * @example
 * const data = await withRetry(
 *   () => fetch('https://api.example.com'),
 *   3,    // 3회 재시도
 *   2000  // 2초 대기
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
  delay = DEFAULT_DELAY
): Promise<T> {
  // 마지막 에러를 저장 (모든 재시도 실패 시 이 에러를 throw)
  let lastError: Error | null = null;

  // retries 횟수만큼 시도
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // 함수 실행 성공 시 바로 결과 반환
      return await fn();
    } catch (error) {
      // 에러 저장
      lastError = error instanceof Error ? error : new Error(String(error));

      // 마지막 시도가 아니면 대기 후 재시도
      if (attempt < retries) {
        // Exponential Backoff: 대기 시간을 2의 거듭제곱으로 증가
        // attempt=1: delay * 1 = 2000ms
        // attempt=2: delay * 2 = 4000ms
        // attempt=3: delay * 4 = 8000ms
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  // 모든 재시도 실패 시 마지막 에러 throw
  throw lastError ?? new Error('알 수 없는 오류');
}

/**
 * Promise에 타임아웃 적용
 *
 * [fetchWithTimeout과의 차이점]
 * - fetchWithTimeout: fetch 전용
 * - withTimeout: 모든 Promise에 적용 가능
 *
 * [동작 원리]
 * - Promise.race: 먼저 완료되는 Promise 결과 반환
 * - 원래 Promise vs 타임아웃 Promise 경쟁
 *
 * @param promise - 타임아웃을 적용할 Promise
 * @param ms - 타임아웃 시간 (밀리초)
 * @returns Promise 결과 또는 타임아웃 에러
 *
 * @example
 * const result = await withTimeout(
 *   slowApiCall(),  // 느린 API 호출
 *   5000            // 5초 타임아웃
 * );
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise, // 원래 Promise
    // 타임아웃 Promise - ms 후 reject
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}