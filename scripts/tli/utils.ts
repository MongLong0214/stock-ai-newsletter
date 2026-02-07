/** 지정 시간만큼 대기 */
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 재시도 로직이 포함된 API 호출 래퍼 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  context = 'API call',
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      console.error(`   ${context} 시도 ${attempt}/${retries} 실패:`, error instanceof Error ? error.message : String(error))
      if (attempt === retries) throw error
      await sleep(1000 * Math.pow(2, attempt - 1))
    }
  }
  throw new Error(`${context}: 모든 재시도 실패`)
}

/** KST 기준 현재 날짜 (YYYY-MM-DD) */
export function getKSTDate(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

/** 오늘 날짜 (YYYY-MM-DD, KST) */
export function today(): string {
  return getKSTDate()
}

/** N일 전 날짜 (YYYY-MM-DD, KST) */
export function daysAgo(n: number): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - n * 86400000)
  return kst.toISOString().split('T')[0]
}