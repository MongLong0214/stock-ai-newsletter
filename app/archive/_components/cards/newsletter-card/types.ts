/**
 * NewsletterCard 컴포넌트 타입 정의
 */

import type { StockData, DateString } from '../../../_types/archive.types';
import type { PriceUnavailableReason } from '../../../_hooks/use-stock-prices';

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
  /** 추천일 전일 종가 (KIS API에서 조회) */
  historicalClosePrice?: number;
  /** 실시간 시세 로딩 상태 */
  isLoadingPrice?: boolean;
  /** 현재가 조회 불가 사유 */
  unavailableReason?: PriceUnavailableReason | null;
}

/** 가격 변동 정보 */
export interface PriceChangeInfo {
  amount: number;
  percent: string;
  isPositive: boolean;
}