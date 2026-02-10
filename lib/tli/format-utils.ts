/** 공통 포맷 유틸리티 — 가격, 거래량, 점수 변화, 상대 시간 */

/** 가격 포맷: null → '—', 52300 → "52,300" */
export function formatPrice(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('ko-KR')
}

/** 거래량 축약: null → '—', 1억+ → "X.X억", 1만+ → "X만", 그 외 한국 로캘 */
export function formatVolume(n: number | null): string {
  if (n == null) return '—'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만`
  return n.toLocaleString('ko-KR')
}

/** 점수 변화 포맷: 0 → '—', 양수 → "+X.X", 음수 → "-X.X" */
export function formatScoreChange(value: number): string {
  if (value === 0) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}
