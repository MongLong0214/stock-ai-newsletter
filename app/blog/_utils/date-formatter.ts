/**
 * ISO 날짜 문자열을 한국어 형식으로 변환
 *
 * 한국 시간대(Asia/Seoul)로 변환하여 표시
 * UTC로 저장된 날짜를 한국 시간으로 정확하게 표시
 *
 * @example
 * formatDateKo('2024-01-15T09:30:00Z') // '2024년 1월 15일'
 * formatDateKo('2025-12-04T23:39:05.759+00:00') // '2025년 12월 5일' (UTC 23:39 = KST 08:39 다음날)
 * formatDateKo(null) // ''
 */
export function formatDateKo(dateString: string | null): string {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  });
}