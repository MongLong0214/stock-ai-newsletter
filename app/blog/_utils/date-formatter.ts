/**
 * ISO 날짜 문자열을 한국어 형식으로 변환
 *
 * @example
 * formatDateKo('2024-01-15T09:30:00Z') // '2024년 1월 15일'
 * formatDateKo(null) // ''
 */
export function formatDateKo(dateString: string | null): string {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}