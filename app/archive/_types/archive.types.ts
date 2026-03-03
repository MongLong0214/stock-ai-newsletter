/**
 * 분석 기록 페이지 타입 정의
 */

/**
 * 날짜 문자열 타입 (YYYY-MM-DD)
 */
export type DateString = string & { readonly __brand: 'DateString' };

/**
 * 문자열이 유효한 DateString인지 확인
 */
export function isDateString(value: string): value is DateString {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  const date = new Date(value);
  if (isNaN(date.getTime())) return false;

  const [year, month, day] = value.split('-').map(Number);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * 주식 기술적 분석 시그널
 * 각 점수는 0-100 범위
 */
export interface StockSignals {
  /** 추세 분석 점수 */
  trend_score: number;
  /** 모멘텀 지표 점수 */
  momentum_score: number;
  /** 거래량 분석 점수 */
  volume_score: number;
  /** 변동성 측정 점수 */
  volatility_score: number;
  /** 패턴 인식 점수 */
  pattern_score: number;
  /** 시장 심리 점수 */
  sentiment_score: number;
  /** 종합 전체 점수 */
  overall_score: number;
}

/**
 * 주식 추천 데이터
 */
export interface StockData {
  /** 주식 티커 (예: "AAPL") */
  ticker: string;
  /** 회사명 */
  name: string;
  /** 원화 종가 */
  close_price: number;
  /** AI 생성 추천 근거 */
  rationale: string;
  /** 기술적 분석 시그널 */
  signals: StockSignals;
}

/**
 * 뉴스레터 분석 기록 항목
 */
export interface NewsletterArchive {
  /** 뉴스레터 날짜 */
  date: DateString;
  /** 추천 종목 목록 */
  stocks: StockData[];
  /** 발송 타임스탬프 */
  sentAt: string | null;
  /** 구독자 수 */
  subscriberCount: number;
}

/**
 * Crash Alert 원인 분석
 */
export interface CrashAlertCause {
  /** 원인 요소 */
  factor: string;
  /** 영향도 (high/medium/low) */
  impact: string;
  /** 상세 설명 */
  detail: string;
}

/**
 * Crash Alert 데이터 (폭락장 감지)
 */
export interface CrashAlertData {
  type: 'crash_alert';
  severity: 'warning' | 'critical';
  title: string;
  market_overview: Record<string, string>;
  causes: CrashAlertCause[];
  historical_context: string;
  outlook: string;
  investor_guidance: string;
}

/**
 * Stock 타입 분석 기록 항목
 */
export interface StockArchiveEntry {
  type: 'stock';
  date: DateString;
  stocks: StockData[];
  sentAt: string | null;
  subscriberCount: number;
}

/**
 * Crash Alert 타입 분석 기록 항목
 */
export interface CrashAlertArchiveEntry {
  type: 'crash_alert';
  date: DateString;
  crashAlert: CrashAlertData;
  sentAt: string | null;
  subscriberCount: number;
}

/**
 * 분석 기록 항목 (Discriminated Union)
 */
export type ArchiveEntry = StockArchiveEntry | CrashAlertArchiveEntry;

/**
 * Newsletter 타입 별칭 (하위 호환성)
 */
export type Newsletter = NewsletterArchive;

/**
 * 점수 레벨 분류
 */
export type ScoreLevel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * 점수 색상 구성
 */
export interface ScoreColorConfig {
  /** 그라데이션 클래스 */
  gradient: string;
  /** 텍스트 색상 */
  text: string;
  /** 글로우 효과 */
  glow: string;
  /** 배경 색상 */
  bg: string;
  /** 테두리 색상 */
  border: string;
}