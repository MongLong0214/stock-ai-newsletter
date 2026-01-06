/**
 * 날짜 컨텍스트 팩토리
 * 프롬프트 빌더에 주입할 날짜 정보 생성
 */

import {
  calculatePreviousTradingDay,
  formatISODate,
  formatKrxStyleDate,
  formatDotStyleDate,
  formatKoreanDate,
  formatKoreanDateForSearch,
  formatNumericDate,
  getTradingCalendarYearRange,
} from '@/lib/utils/korean-trading-calendar';

import type { DateContext, DateInfo, SearchFormats, TargetDateInfo } from './types';

/**
 * 기본 날짜 정보 생성
 */
function createDateInfo(date: Date): DateInfo {
  return {
    date: new Date(date),
    korean: formatKoreanDate(date),
    iso: formatISODate(date),
    numeric: formatNumericDate(date),
  };
}

/**
 * 타겟 날짜 정보 생성 (검색용 포맷 포함)
 */
function createTargetDateInfo(date: Date): TargetDateInfo {
  return {
    ...createDateInfo(date),
    koreanForSearch: formatKoreanDateForSearch(date),
  };
}

/**
 * 검색 서비스별 날짜 포맷 생성
 */
function createSearchFormats(targetDate: Date): SearchFormats {
  return {
    naverStyle: formatKoreanDateForSearch(targetDate),
    krxStyle: formatKrxStyleDate(targetDate),
    isoStyle: formatISODate(targetDate),
    dotStyle: formatDotStyleDate(targetDate),
  };
}

/**
 * 한국 시간대(KST, UTC+9)로 변환된 Date 반환
 *
 * @param date - 변환할 Date 객체 (어떤 타임존이든 가능)
 * @returns KST 시간으로 조정된 Date 객체
 */
function toKoreaTime(date: Date): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60 * 1000;
  return new Date(utcTime + KST_OFFSET_MS);
}

function assertValidDateInput(input: Date): void {
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
    throw new TypeError('executionDate must be a valid Date instance');
  }
}

function assertSupportedYear(date: Date): void {
  const { minYear, maxYear } = getTradingCalendarYearRange();
  const year = date.getFullYear();
  if (year < minYear || year > maxYear) {
    throw new RangeError(`executionDate year must be between ${minYear} and ${maxYear}`);
  }
}

/**
 * DateContext 생성
 *
 * @param executionDate - 프롬프트 실행 시점 (기본값: 현재 시간)
 * @returns 프롬프트에 주입할 날짜 컨텍스트
 */
export function createDateContext(executionDate: Date = new Date()): DateContext {
  assertValidDateInput(executionDate);
  const koreaTime = toKoreaTime(executionDate);
  assertSupportedYear(koreaTime);
  const previousTradingDay = calculatePreviousTradingDay(koreaTime);
  const currentYear = koreaTime.getFullYear();

  return {
    today: createDateInfo(koreaTime),
    targetDate: createTargetDateInfo(previousTradingDay),
    searchFormats: createSearchFormats(previousTradingDay),
    currentYear,
    forbiddenYearThreshold: currentYear - 1,
  };
}

/**
 * DateContext 유효성 검증
 */
export function validateDateContext(context: DateContext): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (context.today.date <= context.targetDate.date) {
    errors.push('today must be after targetDate');
  }

  const daysDiff = Math.floor(
    (context.today.date.getTime() - context.targetDate.date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 14) {
    errors.push(`targetDate is ${daysDiff} days ago (max 14 days)`);
  }

  const targetYear = context.targetDate.date.getFullYear();
  if (targetYear < context.forbiddenYearThreshold) {
    errors.push(`targetDate year ${targetYear} is before forbidden threshold ${context.forbiddenYearThreshold}`);
  }

  const expectedIso = formatISODate(context.targetDate.date);
  if (context.targetDate.iso !== expectedIso) {
    errors.push(`ISO date mismatch: ${context.targetDate.iso} vs ${expectedIso}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 날짜 검증 블록 생성 (프롬프트 삽입용)
 */
export function createDateValidationBlock(context: DateContext): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗓️ 날짜 컨텍스트 (자동 주입됨 - 수정 금지)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 오늘 날짜: ${context.today.korean}
   - ISO: ${context.today.iso}
   - 숫자: ${context.today.numeric}

📌 분석 기준일 (전일 거래일): ${context.targetDate.korean}
   - ISO: ${context.targetDate.iso}
   - 숫자: ${context.targetDate.numeric}
   - 검색용: ${context.targetDate.koreanForSearch}

📌 검색 시 사용할 날짜 포맷:
   - Naver/Daum: "${context.searchFormats.naverStyle}"
   - KRX: "${context.searchFormats.krxStyle}"
   - ISO: "${context.searchFormats.isoStyle}"
   - 점 형식: "${context.searchFormats.dotStyle}"

⚠️ 중요:
   - 모든 검색에 위 날짜 포맷 중 하나를 반드시 포함하세요
   - ${context.forbiddenYearThreshold}년 이전 데이터 절대 사용 금지
   - [target_date] 플레이스홀더 사용 금지 (이미 실제 날짜가 주입됨)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}
