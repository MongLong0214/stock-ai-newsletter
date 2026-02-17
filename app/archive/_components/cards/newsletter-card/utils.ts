/**
 * NewsletterCard 유틸리티
 */

import type { DateString } from '../../../_types/archive.types';
import type { StockPrice, PriceChangeInfo } from './types';
import { getPreviousBusinessDateDisplay, getNthBusinessDateAfter } from '../../../_utils/market/hours';
import { MAX_BUSINESS_DAYS } from '../../../_utils/formatting/date';

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
 * 7영업일 후 확정 종가 기준 가격 변동 정보 계산
 */
export function calculateSettledPriceChange(
  settledPrice: number,
  closePrice: number
): PriceChangeInfo | null {
  if (closePrice === 0) return null;

  const change = settledPrice - closePrice;
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

/**
 * 7거래일 후 날짜를 M/D 형식으로 반환 (UI 표시용)
 * @example getSettledDateDisplay('2026-01-09') // '1/20'
 */
export function getSettledDateDisplay(newsletterDate: DateString): string {
  const yyyymmdd = getNthBusinessDateAfter(newsletterDate, MAX_BUSINESS_DAYS);
  const month = parseInt(yyyymmdd.substring(4, 6), 10);
  const day = parseInt(yyyymmdd.substring(6, 8), 10);
  return `${month}/${day}`;
}