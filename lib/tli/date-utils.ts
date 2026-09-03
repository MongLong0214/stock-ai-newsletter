/** KST (UTC+9) 기준 날짜 유틸리티 */

/** KST 오프셋 (밀리초) */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000
export const DAY_MS = 86_400_000

const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** KST 기준 Date 객체 반환 (offsetDays: 음수 = 과거, 양수 = 미래) */
export function getKSTDate(offsetDays = 0): Date {
  return new Date(Date.now() + KST_OFFSET_MS + offsetDays * DAY_MS)
}

/** KST 기준 날짜 문자열 (YYYY-MM-DD) */
export function getKSTDateString(offsetDays = 0): string {
  return getKSTDate(offsetDays).toISOString().split('T')[0]
}

/** 타임스탬프를 KST 기준 날짜(YYYY-MM-DD)로 변환. 값이 없거나 잘못되면 null. */
export function formatKSTDateFromTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null

  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : KST_DATE_FORMATTER.format(date)
}

export function formatKoreanDate(dateString: string, format: 'short' | 'long'): string {
  const [year, monthPart, dayPart] = dateString.split('-')
  const month = Number(monthPart)
  const day = Number(dayPart)

  if (!year || !Number.isInteger(month) || !Number.isInteger(day)) return dateString

  return format === 'long'
    ? `${year}년 ${month}월 ${day}일`
    : `${year}. ${month}. ${day}.`
}

/** 일수 → 자연어 (30일 이상 개월 병기, 365일 초과 캡) */
export function formatDays(d: number): string {
  if (d > 365) return '1년+'
  if (d >= 30) return `${d}일(~${Math.round(d / 30)}개월)`
  return `${d}일`
}
