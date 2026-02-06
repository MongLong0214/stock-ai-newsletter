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
    } catch (error) {
      console.error(`   ${context} 시도 ${attempt}/${retries} 실패:`, error)
      if (attempt === retries) throw error
      await sleep(1000 * Math.pow(2, attempt - 1))
    }
  }
  throw new Error(`${context}: 모든 재시도 실패`)
}

/** 오늘 날짜 (YYYY-MM-DD) */
export function today(): string {
  return new Date().toISOString().split('T')[0]
}

/** N일 전 날짜 (YYYY-MM-DD) */
export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split('T')[0]
}