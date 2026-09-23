/**
 * 한국 주식시장 거래일 계산 유틸리티
 * 환각 방지를 위한 정확한 날짜 계산 및 포맷팅
 */

import { KOREAN_MARKET_HOLIDAYS_BY_YEAR } from '@/app/archive/_utils/market/_constants/holidays'

/**
 * 공휴일 데이터는 `app/archive/_utils/market/_constants/holidays.ts`가 단일 진실이다.
 *
 * 2026-09-23 사고: 이 파일과 그 표가 추석 연휴를 다르게 담고 있었다(여기 9/24~26,
 * 저기 9/23~25). 실제 개장 판정은 저쪽을 보므로 9/23(평일)이 휴장일로 처리돼 그날
 * 발행이 통째로 누락됐다. 표를 두 벌 두면 언젠가 갈라지고, 갈라진 순간을 아무도 모른다.
 */
const KOREAN_HOLIDAYS: Record<number, readonly string[]> = Object.fromEntries(
  Object.entries(KOREAN_MARKET_HOLIDAYS_BY_YEAR).map(([year, dates]) => [Number(year), [...dates]]),
)

export class TradingDayError extends Error {
  readonly referenceDate: Date;
  readonly maxLookbackDays: number;

  constructor(message: string, options: { referenceDate: Date; maxLookbackDays: number }) {
    super(message);
    this.name = 'TradingDayError';
    this.referenceDate = new Date(options.referenceDate);
    this.maxLookbackDays = options.maxLookbackDays;
  }
}

export function getTradingCalendarYearRange(): { minYear: number; maxYear: number } {
  const years = Object.keys(KOREAN_HOLIDAYS).map((year) => Number(year));
  const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
  const maxYear = years.length > 0 ? Math.max(...years) : minYear;
  return { minYear, maxYear };
}

/**
 * 특정 연도의 한국 공휴일 Set 반환
 */
export function getKoreanHolidays(year: number): Set<string> {
  return new Set(KOREAN_HOLIDAYS[year] ?? []);
}

/**
 * 주말 여부 확인
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 거래일 여부 확인
 */
export function isTradingDay(date: Date, holidays: Set<string>): boolean {
  if (isWeekend(date)) return false;
  const isoDate = formatISODate(date);
  return !holidays.has(isoDate);
}

/**
 * 전일 거래일 계산
 * 주말 및 공휴일을 제외한 가장 최근 거래일 반환
 */
export function calculatePreviousTradingDay(today: Date): Date {
  const year = today.getFullYear();
  const holidays = getKoreanHolidays(year);
  const prevYearHolidays = getKoreanHolidays(year - 1);

  // 현재 연도와 이전 연도 공휴일 병합 (연말연시 처리)
  const allHolidays = new Set([...holidays, ...prevYearHolidays]);

  const candidate = new Date(today);
  candidate.setDate(candidate.getDate() - 1);

  const maxLookbackDays = 14;
  // 최대 14일 탐색 (14일 연속 비거래일은 불가능)
  for (let i = 0; i < maxLookbackDays; i++) {
    if (isTradingDay(candidate, allHolidays)) {
      return candidate;
    }
    candidate.setDate(candidate.getDate() - 1);
  }

  throw new TradingDayError('전일 거래일을 계산할 수 없습니다 (14일 이상 비거래일)', {
    referenceDate: today,
    maxLookbackDays,
  });
}

/**
 * 한국어 날짜 포맷 (예: "2026년 1월 6일 (월요일)")
 */
export function formatKoreanDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayNames = [
    '일요일',
    '월요일',
    '화요일',
    '수요일',
    '목요일',
    '금요일',
    '토요일',
  ];
  const dayName = dayNames[date.getDay()];
  return `${year}년 ${month}월 ${day}일 (${dayName})`;
}

/**
 * ISO 형식 날짜 (예: "2026-01-06")
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * KRX 스타일 날짜 포맷 (예: "2026/01/06")
 */
export function formatKrxStyleDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * 점 스타일 날짜 포맷 (예: "2026.01.06")
 */
export function formatDotStyleDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/**
 * 숫자 형식 날짜 (예: "20260106")
 */
export function formatNumericDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 검색용 한국어 날짜 포맷 (예: "2026년 1월 6일")
 */
export function formatKoreanDateForSearch(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}년 ${month}월 ${day}일`;
}
