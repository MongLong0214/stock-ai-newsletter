/** KST (UTC+9) 기준 날짜 유틸리티 */

/** KST 오프셋 (밀리초) */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 기준 Date 객체 반환 (offsetDays: 음수 = 과거, 양수 = 미래) */
export function getKSTDate(offsetDays = 0): Date {
  return new Date(Date.now() + KST_OFFSET_MS + offsetDays * 86_400_000)
}

/** KST 기준 날짜 문자열 (YYYY-MM-DD) */
export function getKSTDateString(offsetDays = 0): string {
  return getKSTDate(offsetDays).toISOString().split('T')[0]
}

/** 일수 → 자연어 (30일 이상 개월 병기, 365일 초과 캡) */
export function formatDays(d: number): string {
  if (d > 365) return '1년+'
  if (d >= 30) return `${d}일(~${Math.round(d / 30)}개월)`
  return `${d}일`
}
