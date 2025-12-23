/**
 * NewsletterCard 유틸리티 함수
 */

import type { DateString } from '../../../_types/archive.types';
import type { StockPrice, PriceChangeInfo } from './types';
import { DATE_CALC } from './constants';

/**
 * 가격 변동 정보 계산
 */
export function calculatePriceChange(
  currentPrice: StockPrice | undefined,
  closePrice: number
): PriceChangeInfo | null {
  if (!currentPrice) return null;

  const change = currentPrice.currentPrice - closePrice;
  const changePercent = ((change / closePrice) * 100).toFixed(2);
  const isPositive = change >= 0;

  return {
    amount: Math.abs(change),
    percent: changePercent,
    isPositive,
  };
}

/**
 * 추천일 전일 날짜 포맷팅 (예: "1월 5일")
 * @deprecated close_price_date 필드가 있으면 formatClosePriceDate 사용 권장
 */
export function getPreviousDate(newsletterDate: DateString): string {
  const date = new Date(newsletterDate);
  const dayOfWeek = date.getDay();
  const daysToSubtract =
    dayOfWeek === DATE_CALC.MONDAY ? DATE_CALC.WEEKEND_OFFSET : DATE_CALC.WEEKDAY_OFFSET;
  date.setDate(date.getDate() - daysToSubtract);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * close_price_date 포맷팅 (예: "2025-12-22" → "12월 22일")
 */
export function formatClosePriceDate(closePriceDate: string): string {
  const date = new Date(closePriceDate);
  if (isNaN(date.getTime())) {
    return closePriceDate; // 파싱 실패 시 원본 반환
  }
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 종가 기준 날짜 결정 (close_price_date 우선, 없으면 newsletterDate 기반 계산)
 */
export function getClosePriceDateDisplay(
  closePriceDate: string | undefined,
  newsletterDate: DateString
): string {
  if (closePriceDate && /^\d{4}-\d{2}-\d{2}$/.test(closePriceDate)) {
    return formatClosePriceDate(closePriceDate);
  }
  return getPreviousDate(newsletterDate);
}