/**
 * 주식 종목 기술적 신호 점수
 *
 * 각 카테고리별 점수는 0-100 범위의 정수
 *
 * @property trend_score - 추세 점수 (SMA, EMA 등 추세 지표)
 * @property momentum_score - 모멘텀 점수 (RSI, MACD 등 모멘텀 지표)
 * @property volume_score - 거래량 점수 (거래량 변화율, OBV 등)
 * @property volatility_score - 변동성 점수 (ATR, Bollinger Bands 등)
 * @property pattern_score - 패턴 점수 (차트 패턴, 캔들 패턴 등)
 * @property sentiment_score - 심리 점수 (투자자 심리, 뉴스 감성 등)
 * @property overall_score - 종합 점수 (전체 지표의 가중 평균)
 */
export interface StockSignals {
  trend_score: number;
  momentum_score: number;
  volume_score: number;
  volatility_score: number;
  pattern_score: number;
  sentiment_score: number;
  overall_score: number;
}

/**
 * 주식 종목 데이터
 *
 * Gemini Pipeline이 생성하는 최종 JSON 형식
 *
 * @property ticker - 종목 코드 (형식: "KOSPI:005930" 또는 "KOSDAQ:035420")
 * @property name - 종목명 (예: "삼성전자", "SK하이닉스")
 * @property close_price - 전일 종가 (정수, 양수)
 * @property close_price_date - 종가 기준 날짜 (형식: "YYYY-MM-DD")
 * @property rationale - 선정 근거 ("|" 구분, 최소 12개 지표, 최소 50자)
 * @property signals - 7개 카테고리 점수 (0-100)
 *
 * @example
 * ```typescript
 * const stock: StockData = {
 *   ticker: "KOSPI:005930",
 *   name: "삼성전자",
 *   close_price: 75300,
 *   close_price_date: "2025-12-22",
 *   rationale: "SMA 완전정배열|EMA 골든크로스|RSI 58 강세권|MACD 양전환|거래량 165% 급증|볼린저 중상단|ATR 3.2% 적정|ADX 28 강한추세|OBV 지속상승|스토캐스틱 상승전환|SuperTrend 매수|52주 상위 72%",
 *   signals: {
 *     trend_score: 88,
 *     momentum_score: 85,
 *     volume_score: 90,
 *     volatility_score: 82,
 *     pattern_score: 87,
 *     sentiment_score: 84,
 *     overall_score: 86
 *   }
 * };
 * ```
 */
export interface StockData {
  ticker: string;
  name: string;
  close_price: number;
  close_price_date?: string;
  rationale: string;
  signals: StockSignals;
}

/**
 * 주식 종목 배열 타입
 *
 * Gemini Pipeline의 최종 출력 형식
 * 1-3개 종목을 포함하는 배열
 */
export type StockDataArray = StockData[];