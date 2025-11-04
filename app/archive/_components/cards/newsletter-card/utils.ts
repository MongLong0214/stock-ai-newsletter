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
 */
export function getPreviousDate(newsletterDate: DateString): string {
  const date = new Date(newsletterDate);
  const dayOfWeek = date.getDay();
  const daysToSubtract =
    dayOfWeek === DATE_CALC.MONDAY ? DATE_CALC.WEEKEND_OFFSET : DATE_CALC.WEEKDAY_OFFSET;
  date.setDate(date.getDate() - daysToSubtract);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}