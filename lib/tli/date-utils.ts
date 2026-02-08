/** KST (UTC+9) 기준 날짜 유틸리티 */

export function getKSTDateString(offsetDays = 0): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000)
  return kst.toISOString().split('T')[0]
}
