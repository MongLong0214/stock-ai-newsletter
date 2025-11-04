/**
 * 한국 주식 시장 개장/마감 시간 계산 유틸리티
 *
 * 기능:
 * - 시장 개장 여부 확인
 * - 다음 개장 시간 계산 (주말 고려, 공휴일 미지원)
 * - 캐시 만료 시간 계산
 *
 * 타임존 처리:
 * - date-fns-tz 사용으로 정확한 KST 변환 보장
 * - DST (일광 절약 시간) 처리 불필요 (한국은 DST 없음)
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';

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
 * KST 기준 주말 여부 확인
 *
 * @param kstDate - KST Date 객체 (toKST로 변환된 값)
 */
function isWeekendKST(kstDate: Date): boolean {
  const day = kstDate.getDay();
  return day === SUNDAY || day === SATURDAY;
}

/**
 * 시장 개장 여부 확인
 *
 * 개장 시간: 09:00 ~ 15:30 KST (15:30:00 exclusive)
 * 주말은 휴장
 *
 * @param now - 확인할 시간 (기본값: 현재 시간)
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const kstDate = toKST(now);

  if (isWeekendKST(kstDate)) {
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
 * - 오늘 09:00 이전 + 평일 → 오늘 09:00
 * - 오늘 09:00 이후 또는 주말 → 다음 평일 09:00
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

  // 오늘 장이 아직 시작 안했으면 오늘 09:00 (평일만)
  if (currentMinutes < MARKET_OPEN_MINUTES && !isWeekendKST(kstDate)) {
    return toUTC(nextOpen);
  }

  // 장 중이거나 장 마감 후면 다음 날로 이동
  nextOpen.setDate(nextOpen.getDate() + 1);

  // 주말이면 월요일로 이동
  while (isWeekendKST(nextOpen)) {
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