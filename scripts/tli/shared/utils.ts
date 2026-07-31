import { getKSTDateString } from '@/lib/tli/date-utils'

/** 지정 시간만큼 대기 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 재시도 로직이 포함된 API 호출 래퍼
 *
 * REL-001 fix: honors Retry-After, bounded exponential jitter,
 * does NOT retry 4xx client errors (except 429 rate limit).
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

      // Do not retry non-retryable 4xx errors (except 429)
      const is429 = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')
      const is4xx = /\b4\d{2}\b/.test(errorMsg) && !is429
      if (is4xx) {
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
