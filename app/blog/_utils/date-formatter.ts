/**
 * 날짜 포맷팅 유틸리티
 */

const WORDS_PER_MINUTE = 200;

/** ISO 날짜 문자열을 한국어 형식으로 변환 */
export function formatDateKo(dateString: string | null): string {
  if (!dateString) return '';

  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 읽기 시간 계산 (분) */
export function calculateReadTime(content: string): number {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount / WORDS_PER_MINUTE);
}