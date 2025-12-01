/**
 * 날짜 포맷팅 유틸리티
 *
 * [이 파일의 역할]
 * - 날짜를 사용자가 읽기 쉬운 형태로 변환
 * - 콘텐츠 읽기 시간 계산
 *
 * [사용 예시]
 * - formatDateKo('2024-01-15') → '2024년 1월 15일'
 * - calculateReadTime('긴 텍스트...') → 5 (분)
 */

/** 분당 읽는 단어 수 (평균) - 한국어 기준 */
const WORDS_PER_MINUTE = 200;

/**
 * ISO 날짜 문자열을 한국어 형식으로 변환
 *
 * [동작 설명]
 * 1. ISO 형식 날짜 (예: '2024-01-15T09:30:00Z') 입력
 * 2. 한국어 형식 (예: '2024년 1월 15일')으로 변환
 * 3. null이면 빈 문자열 반환
 *
 * @param dateString - ISO 형식 날짜 문자열 또는 null
 * @returns 한국어 형식 날짜 문자열
 *
 * @example
 * formatDateKo('2024-01-15T09:30:00Z') // '2024년 1월 15일'
 * formatDateKo(null) // ''
 */
export function formatDateKo(dateString: string | null): string {
  // null 체크 - 날짜가 없으면 빈 문자열 반환
  if (!dateString) return '';

  // Date 객체로 변환 후 한국어 로케일로 포맷팅
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',  // 연도: '2024'
    month: 'long',    // 월: '1월'
    day: 'numeric',   // 일: '15'
  });
}

/**
 * 콘텐츠 읽기 시간 계산 (분 단위)
 *
 * [계산 방식]
 * 1. 텍스트를 공백 기준으로 단어 분리
 * 2. 빈 문자열 제거
 * 3. 단어 수 / 분당 읽는 속도 = 예상 읽기 시간
 * 4. 올림 처리 (1.5분 → 2분)
 *
 * @param content - 읽기 시간을 계산할 텍스트
 * @returns 예상 읽기 시간 (분, 정수)
 *
 * @example
 * calculateReadTime('안녕하세요 반갑습니다') // 1
 */
export function calculateReadTime(content: string): number {
  // 공백으로 분리 → 빈 문자열 제거 → 단어 개수 계산
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // 단어 수 / 분당 읽는 속도, 올림 처리
  return Math.ceil(wordCount / WORDS_PER_MINUTE);
}