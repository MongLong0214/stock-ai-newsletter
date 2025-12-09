/**
 * NewsletterCard 컴포넌트 상수
 */

import type { StockSignals } from '../../../_types/archive.types';

/** 추천 근거 레이아웃 설정 */
export const RATIONALE_LAYOUT = {
  ITEM_HEIGHT: 42,
  HEADER_HEIGHT: 32,
  BOTTOM_PADDING: 24,
  CONTENT_OFFSET: 50,
} as const;

/** 날짜 계산 상수 */
export const DATE_CALC = {
  MONDAY: 1,
  WEEKEND_OFFSET: 3,
  WEEKDAY_OFFSET: 1,
} as const;

/** 시그널 점수 키 타입 (overall_score 제외) */
type SignalKey = keyof Omit<StockSignals, 'overall_score'>;

/** 시그널 배지 설정 아이템 타입 */
interface SignalBadgeConfig {
  label: string;
  key: SignalKey;
}

/** 시그널 점수 배지 설정 */
export const SIGNAL_BADGES: readonly SignalBadgeConfig[] = [
  { label: '추세', key: 'trend_score' },
  { label: '모멘텀', key: 'momentum_score' },
  { label: '거래량', key: 'volume_score' },
  { label: '변동성', key: 'volatility_score' },
  { label: '패턴', key: 'pattern_score' },
  { label: '심리', key: 'sentiment_score' },
];