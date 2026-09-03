import { getKSTDateString } from '@/lib/tli/date-utils'

/** 지정 시간만큼 대기 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 재시도 로직이 포함된 API 호출 래퍼 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  context = 'API call',
  options: { readonly shouldRetry?: (error: unknown) => boolean } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      console.error(`   ${context} 시도 ${attempt}/${retries} 실패:`, error instanceof Error ? error.message : String(error))
      if (options.shouldRetry?.(error) === false) throw error
      if (attempt === retries) throw error
      await sleep(1000 * Math.pow(2, attempt - 1))
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
