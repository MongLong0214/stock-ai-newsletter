import { getKSTDateString } from '@/lib/tli/date-utils'

/** 지정 시간만큼 대기 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** HTTP 상태를 실어 나르는 에러 형태 (fetch Response, 라이브러리 에러 공통) */
function readStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === 'number' && Number.isInteger(value)) return value
  }
  return null
}

/**
 * 재시도해도 소용없는 4xx 판정.
 *
 * 구조화된 status를 우선 신뢰한다. 메시지 문자열에서 세 자리 숫자를 긁는 방식은
 * "Timeout after 450ms" 같은 무관한 값에 걸려 재시도를 조용히 꺼버리므로,
 * status가 없을 때만 HTTP 문맥이 명확한 패턴으로 좁혀서 본다.
 */
function isNonRetryableClientError(error: unknown, message: string): boolean {
  if (/RESOURCE_EXHAUSTED/.test(message)) return false

  const status = readStatusCode(error)
  if (status !== null) {
    return status >= 400 && status < 500 && status !== 429 && status !== 408
  }

  // status가 없으면 HTTP 상태로 읽히는 문맥에서만 코드를 추출한다.
  const contextual = /\b(?:HTTP|status(?:\s*code)?|응답)\D{0,10}(\d{3})\b/i.exec(message)
  if (!contextual) return false

  const parsed = Number(contextual[1])
  return parsed >= 400 && parsed < 500 && parsed !== 429 && parsed !== 408
}

/** 재시도 로직이 포함된 API 호출 래퍼
 *
 * REL-001 fix: honors Retry-After, bounded exponential jitter,
 * does NOT retry 4xx client errors (except 429 rate limit / 408 timeout).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  context = 'API call',
  options?: { deadlineMs?: number; budgetMs?: number },
): Promise<T> {
  const deadline = options?.deadlineMs ? Date.now() + options.deadlineMs : Infinity
  let elapsed = 0

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (Date.now() >= deadline) {
      throw new Error(`${context}: deadline exceeded after ${attempt - 1} attempts`)
    }

    try {
      return await fn()
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`   ${context} 시도 ${attempt}/${retries} 실패:`, errorMsg)

      // Do not retry non-retryable 4xx client errors (except 429)
      if (isNonRetryableClientError(error, errorMsg)) {
        throw error
      }

      if (attempt === retries) throw error

      // Compute delay: respect Retry-After header if embedded in error
      let baseDelay = 1000 * Math.pow(2, attempt - 1)
      const retryAfterMatch = errorMsg.match(/Retry-After[:\s]+(\d+)/i)
      if (retryAfterMatch) {
        baseDelay = Math.max(baseDelay, Number(retryAfterMatch[1]) * 1000)
      }

      // Add jitter (±25%)
      const jitter = baseDelay * (0.75 + Math.random() * 0.5)
      const delay = Math.min(jitter, 60_000)

      // Budget check
      elapsed += delay
      if (options?.budgetMs && elapsed > options.budgetMs) {
        throw new Error(`${context}: retry budget exhausted (${elapsed}ms > ${options.budgetMs}ms)`)
      }

      if (Date.now() + delay >= deadline) {
        throw new Error(`${context}: next retry would exceed deadline`)
      }

      await sleep(delay)
    }
  }
  throw new Error(`${context}: 모든 재시도 실패`)
}

/** KST 기준 현재 날짜 (YYYY-MM-DD)
 * NOTE: 정규 버전은 lib/tli/date-utils.ts — scripts는 빌드 설정 차이로 별도 유지 */
export function getKSTDate(): string {
  return getKSTDateString()
}

/** N일 전 날짜 (YYYY-MM-DD, KST) */
export function daysAgo(n: number): string {
  return getKSTDateString(-n)
}
