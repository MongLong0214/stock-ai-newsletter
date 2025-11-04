/**
 * NewsletterCard 컴포넌트 타입 정의
 */

import type { StockData, DateString } from '../../../_types/archive.types';

/** 실시간 주식 시세 정보 */
export interface StockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

/** 뉴스레터 카드 Props */
export interface NewsletterCardProps {
  /** 주식 데이터 */
  stock: StockData;
  /** 표시할 최대 분석 근거 개수 */
  maxRationaleItems: number;
  /** 뉴스레터 발행일 */
  newsletterDate: DateString;
  /** 실시간 시세 (선택) */
  currentPrice?: StockPrice;
  /** 실시간 시세 로딩 상태 */
  isLoadingPrice?: boolean;
}

/** 가격 변동 정보 */
export interface PriceChangeInfo {
  amount: number;
  percent: string;
  isPositive: boolean;
}