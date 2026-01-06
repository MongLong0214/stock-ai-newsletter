/**
 * 한국 주식시장 거래일 계산 유틸리티
 * 환각 방지를 위한 정확한 날짜 계산 및 포맷팅
 */

// 한국 공휴일 데이터 (2024-2027)
const KOREAN_HOLIDAYS: Record<number, string[]> = {
  2024: [
    '2024-01-01', // 신정
    '2024-02-09',
    '2024-02-10',
    '2024-02-11', // 설날
    '2024-03-01', // 삼일절
    '2024-04-10', // 국회의원선거
    '2024-05-05',
    '2024-05-06', // 어린이날 + 대체공휴일
    '2024-05-15', // 부처님오신날
    '2024-06-06', // 현충일
    '2024-08-15', // 광복절
    '2024-09-16',
    '2024-09-17',
    '2024-09-18', // 추석
    '2024-10-03', // 개천절
    '2024-10-09', // 한글날
    '2024-12-25', // 크리스마스
  ],
  2025: [
    '2025-01-01', // 신정
    '2025-01-28',
    '2025-01-29',
    '2025-01-30', // 설날
    '2025-03-01',
    '2025-03-03', // 삼일절 + 대체공휴일
    '2025-05-05',
    '2025-05-06', // 어린이날 + 대체공휴일
    '2025-06-06', // 현충일
    '2025-08-15', // 광복절
    '2025-10-03', // 개천절
    '2025-10-05',
    '2025-10-06',
    '2025-10-07',
    '2025-10-08', // 추석
    '2025-10-09', // 한글날
    '2025-12-25', // 크리스마스
  ],
  2026: [
    '2026-01-01', // 신정
    '2026-02-16',
    '2026-02-17',
    '2026-02-18', // 설날
    '2026-03-01',
    '2026-03-02', // 삼일절 + 대체공휴일
    '2026-05-05', // 어린이날
    '2026-05-24', // 부처님오신날
    '2026-06-06', // 현충일
    '2026-08-15',
    '2026-08-17', // 광복절 + 대체공휴일
    '2026-09-24',
    '2026-09-25',
    '2026-09-26', // 추석
    '2026-10-03',
    '2026-10-05', // 개천절 + 대체공휴일
    '2026-10-09', // 한글날
    '2026-12-25', // 크리스마스
  ],
  2027: [
    '2027-01-01', // 신정
    '2027-02-06',
    '2027-02-07',
    '2027-02-08',
    '2027-02-09', // 설날
    '2027-03-01', // 삼일절
    '2027-05-05', // 어린이날
    '2027-05-13', // 부처님오신날
    '2027-06-06',
    '2027-06-07', // 현충일 + 대체공휴일
    '2027-08-15',
    '2027-08-16', // 광복절 + 대체공휴일
    '2027-10-03',
    '2027-10-04', // 개천절 + 대체공휴일
    '2027-10-09',
    '2027-10-11', // 한글날 + 대체공휴일
    '2027-10-13',
    '2027-10-14',
    '2027-10-15', // 추석
    '2027-12-25', // 크리스마스
  ],
};

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
