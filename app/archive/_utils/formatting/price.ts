/**
 * 가격 포맷팅 유틸리티
 *
 * 일관된 금융 데이터 표시를 위한 함수
 * 로케일 특화 숫자 포맷팅으로 원화(₩) 포맷팅 처리
 */

/**
 * 숫자 가격을 원화 기호와 함께 포맷
 *
 * 기능:
 * - 원화 기호(₩) 추가
 * - 천 단위 구분자에 한국 로케일 사용
 * - 한국 시장에 적합한 소수점 처리
 *
 * @param price - 숫자 가격 값
 * @returns ₩ 기호와 로케일 특화 포맷이 적용된 가격 문자열
 *
 * @example
 * formatPrice(50000) // Returns "₩50,000"
 * formatPrice(1234567) // Returns "₩1,234,567"
 * formatPrice(100) // Returns "₩100"
 */
export function formatPrice(price: number): string {
  return `₩${price.toLocaleString('ko-KR')}`;
}