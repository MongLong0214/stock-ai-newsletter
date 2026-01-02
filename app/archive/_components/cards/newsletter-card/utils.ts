/**
 * NewsletterCard 유틸리티
 */

import type { DateString } from '../../../_types/archive.types';
import type { StockPrice, PriceChangeInfo } from './types';
import { getPreviousBusinessDateDisplay } from '../../../_utils/market/hours';

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
 * 추천일 전일 날짜 포맷팅 (영업일 기준)
 * @example getPreviousDate('2026-01-02') // '12월 31일'
 */
export function getPreviousDate(newsletterDate: DateString): string {
  return getPreviousBusinessDateDisplay(newsletterDate);
}