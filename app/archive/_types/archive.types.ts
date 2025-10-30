/**
 * 아카이브 페이지 타입 정의
 *
 * Supabase 스키마 및 lib/llm/_types/stock-data.ts의 기존 StockData 타입과 일치하는
 * 뉴스레터 아카이브 데이터 구조
 *
 * 기능:
 * - 타입 안전성을 위한 브랜드 타입 (DateString, ISODateTime)
 * - 포괄적인 JSDoc 문서화
 * - 런타임 검증 헬퍼
 * - API 응답 타입 정의
 */

/**
 * ISO 8601 날짜 문자열을 위한 브랜드 타입 (YYYY-MM-DD)
 * 일반 문자열과 날짜 문자열의 실수로 인한 혼용 방지
 */
export type DateString = string & { readonly __brand: 'DateString' };

/**
 * ISO 8601 날짜시간 문자열을 위한 브랜드 타입
 * 시간 구성요소를 포함한 타임스탬프에 사용
 */
export type ISODateTime = string & { readonly __brand: 'ISODateTime' };

/**
 * 문자열이 유효한 DateString인지 확인하는 타입 가드
 *
 * @param value - 검증할 문자열
 * @returns 유효한 YYYY-MM-DD 형식이면 true
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
 * 문자열을 DateString으로 변환 (런타임 검증 포함)
 *
 * @param value - 변환할 문자열
 * @returns DateString 또는 유효하지 않으면 null
 */
export function toDateString(value: string): DateString | null {
  return isDateString(value) ? value : null;
}

/**
 * 주식 기술적 분석 시그널
 * 각 점수는 0-100 범위로 정규화됨
 */
export interface StockSignals {
  /** 추세 분석 점수 (0-100) */
  trend_score: number;

  /** 모멘텀 지표 점수 (0-100) */
  momentum_score: number;

  /** 거래량 분석 점수 (0-100) */
  volume_score: number;

  /** 변동성 측정 점수 (0-100) */
  volatility_score: number;

  /** 패턴 인식 점수 (0-100) */
  pattern_score: number;

  /** 시장 심리 점수 (0-100) */
  sentiment_score: number;

  /** 종합 전체 점수 (0-100) */
  overall_score: number;
}

/**
 * 주식 추천 데이터
 * 티커, 가격, 분석 근거 및 기술적 시그널 포함
 */
export interface StockData {
  /** 주식 티커 심볼 (예: "AAPL", "GOOGL") */
  ticker: string;

  /** 회사명 (예: "Apple Inc.") */
  name: string;

  /** 원화 종가 */
  close_price: number;

  /** AI가 생성한 추천 근거 */
  rationale: string;

  /** 기술적 분석 시그널 세부사항 */
  signals: StockSignals;
}

/**
 * 뉴스레터 아카이브 항목
 * 특정 날짜의 완전한 뉴스레터 데이터
 */
export interface NewsletterArchive {
  /** 뉴스레터 날짜 (YYYY-MM-DD 형식) */
  date: DateString;

  /** 해당 날짜의 추천 종목 */
  stocks: StockData[];

  /** 뉴스레터 발송 타임스탬프 (미발송 시 null) */
  sentAt: ISODateTime | null;

  /** 해당 뉴스레터를 받은 구독자 수 */
  subscriberCount: number;
}

/**
 * Supabase의 데이터베이스 행 구조
 * NewsletterArchive로 변환되기 전의 원시 데이터 구조
 */
export interface NewsletterContentRow {
  /** 데이터베이스의 뉴스레터 날짜 */
  newsletter_date: string;

  /** Gemini AI 분석 JSON 문자열 */
  gemini_analysis: string;

  /** 뉴스레터 발송 여부 */
  is_sent: boolean;

  /** 발송 타임스탬프 (미발송 시 null) */
  sent_at: string | null;

  /** 발송 시점의 구독자 수 */
  subscriber_count: number | null;
}

/**
 * 점수 기반 스타일링을 위한 색상 구성
 * 일관된 Matrix/사이버펑크 미학 제공
 */
export interface ScoreColorConfig {
  /** 대형 디스플레이용 그라데이션 클래스 */
  gradient: string;

  /** 텍스트 색상 클래스 */
  text: string;

  /** 글로우 효과 섀도우 클래스 */
  glow: string;

  /** 배경 색상 클래스 */
  bg: string;

  /** 테두리 색상 클래스 */
  border: string;
}

/**
 * 점수 레벨 분류
 * 색상 코딩 및 시각적 계층 구조에 사용
 */
export type ScoreLevel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * API 응답 타입
 * API 엔드포인트 응답을 위한 타입 안전 인터페이스
 */

/**
 * /api/newsletter/available-dates 엔드포인트 응답
 */
export interface AvailableDatesResponse {
  /** YYYY-MM-DD 형식의 사용 가능한 뉴스레터 날짜 배열 */
  dates: DateString[];
}

/**
 * /api/newsletter/[date] 엔드포인트 응답
 */
export interface NewsletterResponse {
  /** 요청된 날짜의 뉴스레터 데이터 */
  newsletter: NewsletterArchive | null;
}

/**
 * 에러 응답 구조
 */
export interface ErrorResponse {
  /** 에러 메시지 */
  error: string;

  /** HTTP 상태 코드 */
  status: number;

  /** 추가 에러 세부사항 (선택사항) */
  details?: unknown;
}
