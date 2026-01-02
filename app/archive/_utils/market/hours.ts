/**
 * 한국 주식 시장 개장/마감 시간 계산 유틸리티
 *
 * 기능:
 * - 시장 개장 여부 확인 (주말, 공휴일 고려)
 * - 다음 개장 시간 계산 (주말, 공휴일 고려)
 * - 캐시 만료 시간 계산
 *
 * 타임존 처리:
 * - date-fns-tz 사용으로 정확한 KST 변환 보장
 * - DST (일광 절약 시간) 처리 불필요 (한국은 DST 없음)
 *
 * 공휴일 데이터:
 * - _constants/holidays.ts에서 관리
 * - 매년 12월에 다음 연도 데이터 업데이트 필요
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from './_constants/holidays';

// Market hours constants (KST)
const MARKET_OPEN_HOUR = 9; // 09:00
const MARKET_CLOSE_HOUR = 15; // 15:30
const MARKET_CLOSE_MINUTE = 30;
const MARKET_OPEN_MINUTES = MARKET_OPEN_HOUR * 60; // 540분
const MARKET_CLOSE_MINUTES = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE; // 930분

// Cache TTL constants
const ONE_MINUTE_MS = 60_000;
const MARKET_OPEN_CACHE_TTL = ONE_MINUTE_MS; // 장 중

// Timezone constants
const KST_TIMEZONE = 'Asia/Seoul';

// Weekend day constants
const SUNDAY = 0;
const SATURDAY = 6;

// 연도별 데이터 누락 경고 (한 번만 출력)
const warnedYears = new Set<number>();

/**
 * Date를 KST로 변환
 * date-fns-tz 사용으로 정확한 타임존 변환 보장
 */
function toKST(date: Date): Date {
  return toZonedTime(date, KST_TIMEZONE);
}

/**
 * KST Date를 UTC로 변환
 * date-fns-tz 사용으로 정확한 타임존 변환 보장
 */
function toUTC(kstDate: Date): Date {
  return fromZonedTime(kstDate, KST_TIMEZONE);
}

/**
 * Date를 YYYY-MM-DD 형식으로 변환
 * @param kstDate - KST Date 객체
 */
function formatDateToYYYYMMDD(kstDate: Date): string {
  const year = kstDate.getFullYear();
  const month = String(kstDate.getMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 주말 여부 확인 (KST 기준)
 * @param kstDate - KST Date 객체
 */
function isWeekendKST(kstDate: Date): boolean {
  const day = kstDate.getDay();
  return day === SUNDAY || day === SATURDAY;
}

/**
 * 공휴일 여부 확인 (KST 기준)
 * 연도별 데이터가 없으면 경고 출력 (한 번만)
 * @param kstDate - KST Date 객체
 */
function isKoreanHoliday(kstDate: Date): boolean {
  const year = kstDate.getFullYear();
  const holidays = KOREAN_MARKET_HOLIDAYS_BY_YEAR[year];

  if (!holidays) {
    if (!warnedYears.has(year)) {
      console.warn(
        `[Market Hours] ${year}년 휴장일 데이터 누락. ` +
          `주말만 체크됩니다. ` +
          `https://open.krx.co.kr/contents/MKD/01/0110/01100305/MKD01100305.jsp 에서 ` +
          `휴장일 확인 후 KOREAN_MARKET_HOLIDAYS_BY_YEAR에 추가하세요.`
      );
      warnedYears.add(year);
    }
    return false;
  }

  const dateString = formatDateToYYYYMMDD(kstDate);
  return holidays.has(dateString);
}

/**
 * 시장 휴장일 여부 확인 (주말 + 공휴일)
 * @param kstDate - KST Date 객체
 */
function isMarketClosed(kstDate: Date): boolean {
  return isWeekendKST(kstDate) || isKoreanHoliday(kstDate);
}

/**
 * 시장 개장 여부 확인
 *
 * 개장 시간: 09:00 ~ 15:30 KST (15:30:00 exclusive)
 * 주말 및 공휴일은 휴장
 *
 * @param now - 확인할 시간 (기본값: 현재 시간)
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const kstDate = toKST(now);

  // 주말 또는 공휴일 체크
  if (isMarketClosed(kstDate)) {
    return false;
  }

  const hour = kstDate.getHours();
  const minute = kstDate.getMinutes();
  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= MARKET_OPEN_MINUTES && currentMinutes < MARKET_CLOSE_MINUTES;
}

/**
 * 다음 영업일 09:00 계산 (KST)
 *
 * 로직:
 * - 오늘 09:00 이전 + 평일/영업일 → 오늘 09:00
 * - 오늘 09:00 이후 또는 휴장일 → 다음 영업일 09:00
 * - 공휴일 및 주말 모두 스킵
 *
 * @param now - 기준 시간 (기본값: 현재 시간)
 * @returns UTC Date 객체
 */
export function getNextMarketOpen(now: Date = new Date()): Date {
  const kstDate = toKST(now);
  const nextOpen = new Date(kstDate);

  // 시간을 09:00:00으로 설정
  nextOpen.setHours(MARKET_OPEN_HOUR, 0, 0, 0);

  const hour = kstDate.getHours();
  const minute = kstDate.getMinutes();
  const currentMinutes = hour * 60 + minute;

  // 오늘 장이 아직 시작 안했으면 오늘 09:00 (영업일만)
  if (currentMinutes < MARKET_OPEN_MINUTES && !isMarketClosed(kstDate)) {
    return toUTC(nextOpen);
  }

  // 장 중이거나 장 마감 후면 다음 날로 이동
  nextOpen.setDate(nextOpen.getDate() + 1);

  // 휴장일이면 다음 영업일로 이동 (주말 + 공휴일)
  while (isMarketClosed(nextOpen)) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  return toUTC(nextOpen);
}

/**
 * 주식 가격 캐시 만료 시간 계산
 *
 * 전략:
 * - 장 중: 1분 후 만료 (실시간성 유지)
 * - 장 마감 후: 다음 영업일 09:00까지 캐싱
 * - 주말: 다음 영업일 09:00까지 캐싱
 *
 * @param now - 기준 시간 (기본값: 현재 시간)
 * @returns Unix timestamp (milliseconds)
 */
export function getStockPriceCacheExpiry(now: Date = new Date()): number {
  if (isMarketOpen(now)) {
    return now.getTime() + MARKET_OPEN_CACHE_TTL;
  }

  return getNextMarketOpen(now).getTime();
}

/**
 * 오늘이 시장 휴장일인지 확인 (주말 또는 공휴일)
 *
 * @param now - 기준 시간 (기본값: 현재 시간)
 * @returns 휴장일이면 true
 */
export function isTodayMarketClosed(now: Date = new Date()): boolean {
  const kstDate = toKST(now);
  return isMarketClosed(kstDate);
}

/**
 * 이전 영업일 Date 객체 계산 (주말 + 공휴일 스킵)
 * @param dateString - YYYY-MM-DD 형식
 */
function getPreviousBusinessDateObj(dateString: string): Date {
  const date = new Date(dateString);
  date.setHours(12, 0, 0, 0);

  date.setDate(date.getDate() - 1);

  // 최대 10일까지 역산 (긴 연휴 대비)
  let attempts = 0;
  while (isMarketClosed(date) && attempts < 10) {
    date.setDate(date.getDate() - 1);
    attempts++;
  }

  return date;
}

/**
 * 이전 영업일 날짜 계산 (주말 + 공휴일 스킵)
 *
 * @param dateString - YYYY-MM-DD 형식의 날짜 문자열
 * @returns YYYYMMDD 형식의 이전 영업일 (KIS API 형식)
 *
 * @example
 * getPreviousBusinessDate('2026-01-02') // 2026-01-01이 신정이면 -> '20251231'
 */
export function getPreviousBusinessDate(dateString: string): string {
  const date = getPreviousBusinessDateObj(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 이전 영업일을 한국어 형식으로 반환 (UI 표시용)
 * @param dateString - YYYY-MM-DD 형식
 * @example getPreviousBusinessDateDisplay('2026-01-02') // '12월 31일'
 */
export function getPreviousBusinessDateDisplay(dateString: string): string {
  const date = getPreviousBusinessDateObj(dateString);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 두 날짜 사이의 영업일 수 계산
 * @param startDate - 시작일 (제외)
 * @param endDate - 종료일 (포함)
 * @example calculateBusinessDays('2026-01-02', '2026-01-05') // 금요일만 영업일 → 1
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (start.getTime() === end.getTime()) return 0;

  let count = 0;
  const current = new Date(start);
  current.setDate(current.getDate() + 1);

  while (current <= end) {
    if (!isMarketClosed(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}