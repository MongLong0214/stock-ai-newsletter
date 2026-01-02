/**
 * 날짜 포맷팅 유틸리티
 *
 * 캘린더 날짜 계산 및 포맷팅을 위한 순수 함수들
 * 엔터프라이즈급 표준을 따르며 포괄적인 문서화 제공
 */

/**
 * 실시간 시세 추적 최대 영업일 수
 * 추천일로부터 이 일수가 지나면 실시간 시세 추적 종료
 */
export const MAX_BUSINESS_DAYS = 7;

/**
 * 특정 월의 일수를 계산
 *
 * @param year - 연도 (예: 2024)
 * @param month - 월 (0-11, 0 = 1월)
 * @returns 해당 월의 일수 (28-31)
 *
 * @example
 * getDaysInMonth(2024, 1) // Returns 29 (February 2024 is a leap year)
 * getDaysInMonth(2024, 0) // Returns 31 (January)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 월의 첫날을 요일로 반환
 *
 * @param year - 연도 (예: 2024)
 * @param month - 월 (0-11, 0 = 1월)
 * @returns 요일 (0-6, 0 = 일요일, 6 = 토요일)
 *
 * @example
 * getFirstDayOfMonth(2024, 0) // Returns day of week for January 1, 2024
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * 날짜 구성요소를 ISO 8601 날짜 문자열로 포맷 (YYYY-MM-DD)
 *
 * @param year - 연도 (예: 2024)
 * @param month - 월 (0-11, 0 = 1월)
 * @param day - 일 (1-31)
 * @returns ISO 8601 포맷의 날짜 문자열
 *
 * @example
 * formatDateString(2024, 0, 5) // Returns "2024-01-05"
 * formatDateString(2024, 11, 25) // Returns "2024-12-25"
 */
export function formatDateString(year: number, month: number, day: number): string {
  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

/**
 * 날짜 문자열을 한국어 형식으로 포맷
 *
 * @param dateString - ISO 날짜 문자열 (YYYY-MM-DD) 또는 null
 * @returns 한국어 포맷의 날짜 문자열 또는 기본 메시지
 *
 * @example
 * formatDisplayDate("2024-01-05") // Returns "2024년 1월 5일"
 * formatDisplayDate(null) // Returns "날짜를 선택하세요"
 */
export function formatDisplayDate(dateString: string | null): string {
  if (!dateString) return '날짜를 선택하세요';

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString));
}

/**
 * 날짜 문자열 형식 검증 (YYYY-MM-DD)
 * 엄격한 형식 준수를 통해 SQL 인젝션 방지
 *
 * 보안 기능:
 * - 형식 검증을 위한 정규식
 * - 논리적 날짜 검증을 위한 Date 객체 검증
 * - 왕복 검증 (파싱 → 포맷 → 비교)
 *
 * @param dateString - 검증할 날짜 문자열
 * @returns 유효한 YYYY-MM-DD 형식이면 true, 그 외 false
 *
 * @example
 * isValidDateFormat("2024-01-05") // Returns true
 * isValidDateFormat("2024-13-01") // Returns false (invalid month)
 * isValidDateFormat("2024-01-32") // Returns false (invalid day)
 * isValidDateFormat("'; DROP TABLE--") // Returns false (SQL injection attempt)
 */
export function isValidDateFormat(dateString: string): boolean {
  // 1단계: 형식 검증 - YYYY-MM-DD 형식과 정확히 일치해야 함
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  // 2단계: 논리적 날짜 검증 - 파싱 가능해야 함
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }

  // 3단계: 왕복 검증 - 정규화가 발생하지 않았는지 확인
  // "2024-02-30"과 같이 "2024-03-02"로 정규화되는 경우를 잡아냄
  const [year, month, day] = dateString.split('-').map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** 한국어 월 이름 (1월 ~ 12월) */
const KOREAN_MONTH_NAMES = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
] as const;

/** 한국어 요일 이름 (일 ~ 토) */
const KOREAN_DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 한국어 월 이름 반환 */
export function getKoreanMonthNames(): readonly string[] {
  return KOREAN_MONTH_NAMES;
}

/** 한국어 요일 이름 반환 (축약형) */
export function getKoreanDayNames(): readonly string[] {
  return KOREAN_DAY_NAMES;
}