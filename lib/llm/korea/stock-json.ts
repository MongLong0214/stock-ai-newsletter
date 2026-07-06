import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import type { StockDataArray, StockData, StockSignals } from '../_types/stock-data';

/**
 * 주식 신호 데이터 검증 (Type Guard)
 *
 * @param signals - 검증할 신호 객체
 * @returns 유효한 StockSignals 타입인 경우 true
 */
function isValidStockSignals(signals: unknown): signals is StockSignals {
  if (!signals || typeof signals !== 'object') return false;

  const scores = signals as Record<string, unknown>;
  const requiredScores: (keyof StockSignals)[] = [
    'trend_score',
    'momentum_score',
    'volume_score',
    'volatility_score',
    'pattern_score',
    'sentiment_score',
    'overall_score',
  ];

  return requiredScores.every((key) => {
    const score = scores[key];
    return typeof score === 'number' && score >= 0 && score <= 100;
  });
}

/**
 * 주식 데이터 검증 (Type Guard)
 *
 * Gemini Pipeline 응답의 JSON 데이터가 올바른 StockDataArray 형식인지 검증합니다.
 *
 * 검증 항목:
 * - 배열 타입 (정확히 3개 항목만 허용)
 * - ticker: "KOSPI:XXXXXX" 또는 "KOSDAQ:XXXXXX" 형식
 * - name: 비어있지 않은 문자열
 * - close_price: 양의 정수
 * - rationale: 50자 이상 문자열
 * - signals: 7개 점수 (0-100)
 *
 * @param data - 검증할 데이터 (unknown 타입)
 * @returns 유효한 StockDataArray 타입인 경우 true, type guard 적용
 */
export function validateStockData(data: unknown): data is StockDataArray {
  // 🚨 정확히 3개 종목만 허용 (1개나 2개는 Pipeline 재시도 필요)
  if (!Array.isArray(data) || data.length !== PIPELINE_CONFIG.REQUIRED_STOCK_COUNT) {
    if (Array.isArray(data) && data.length > 0) {
      console.warn(`❌ [검증 실패] 종목 수 부족: ${data.length}개 (필요: ${PIPELINE_CONFIG.REQUIRED_STOCK_COUNT}개)`);
    }
    return false;
  }

  return data.every((item): item is StockData => {
    if (!item || typeof item !== 'object') return false;

    const candidate = item as Record<string, unknown>;
    const { ticker, name, close_price, rationale, signals } = candidate;

    // 필수 필드 및 타입 검증
    if (typeof ticker !== 'string' || !/^KOS(PI|DAQ):\d{6}$/.test(ticker)) return false;
    if (typeof name !== 'string' || name.length === 0) return false;
    if (typeof close_price !== 'number' || close_price <= 0) return false;
    if (typeof rationale !== 'string' || rationale.length < 50) return false;

    // signals 점수 검증
    return isValidStockSignals(signals);
  });
}

/**
 * JSON 추출 및 검증
 *
 * Gemini 응답에서 JSON 배열을 추출하고 유효성을 검증합니다.
 *
 * 처리 과정:
 * 1. 제어 문자 제거 (ASCII 0x00-0x1F, 0x7F)
 * 2. Gemini tool call 마커 제거 (<ctrl\d+>, call:google_search.search{...})
 * 3. 정규식으로 [{...}] 패턴 추출
 * 4. 각 후보를 JSON.parse → validateStockData로 검증
 * 5. 첫 번째 유효한 JSON 반환
 *
 * @param text - Gemini Pipeline 응답 텍스트
 * @returns 유효한 JSON 문자열 또는 null
 */
export function extractAndValidateJSON(text: string): string | null {
  if (!text?.trim()) {
    console.warn('[JSON 추출 실패] 빈 응답');
    return null;
  }

  try {
    // 제어 문자 및 tool call 제거
    const cleaned = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/<ctrl\d+>/g, '')
      .replace(/call:google_search\.search\{[^}]*}/g, '');

    // 모든 [{...}] 패턴 찾기 (non-greedy)
    const matches = [...cleaned.matchAll(/\[\s*\{[\s\S]*?}\s*]/g)];

    if (matches.length === 0) {
      console.warn('[JSON 추출 실패] JSON 배열 패턴을 찾을 수 없음');
      console.warn(`[응답 내용] ${text.substring(0, 200)}...`);
      return null;
    }

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[0]);
        if (validateStockData(parsed)) {
          console.log(`✅ [JSON 검증 성공] ${parsed.length}개 종목`);
          return match[0];
        }
      } catch {
        // 다음 후보 시도
      }
    }

    console.warn(`[JSON 추출 실패] ${matches.length}개 후보 중 유효한 데이터 없음`);
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[JSON 파싱 에러] ${msg}`);
    return null;
  }
}

/**
 * Crash Alert 데이터 검증
 *
 * 폭락 분석 결과 JSON이 올바른 형식인지 검증합니다.
 */
function validateCrashAlert(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const alert = data as Record<string, unknown>;
  if (alert.type !== 'crash_alert') return false;
  if (typeof alert.severity !== 'string' || !['warning', 'critical'].includes(alert.severity)) return false;
  if (typeof alert.title !== 'string' || alert.title.length === 0) return false;
  if (!alert.market_overview || typeof alert.market_overview !== 'object') return false;
  if (!Array.isArray(alert.causes) || alert.causes.length === 0) return false;
  if (typeof alert.historical_context !== 'string') return false;
  if (typeof alert.outlook !== 'string') return false;
  if (typeof alert.investor_guidance !== 'string') return false;

  // causes 개별 항목 구조 검증
  const causesValid = alert.causes.every((c: unknown) => {
    if (!c || typeof c !== 'object') return false;
    const cause = c as Record<string, unknown>;
    return typeof cause.factor === 'string' && typeof cause.impact === 'string' && typeof cause.detail === 'string';
  });
  if (!causesValid) return false;

  return true;
}

/**
 * Crash Alert JSON 추출 및 검증
 *
 * 폭락 분석 응답에서 crash_alert JSON을 추출하고 검증합니다.
 */
export function extractAndValidateCrashJSON(text: string): string | null {
  if (!text?.trim()) return null;

  try {
    const cleaned = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/<ctrl\d+>/g, '')
      .replace(/call:google_search\.search\{[^}]*}/g, '');

    // JSON 객체 패턴 {...} 찾기
    const matches = [...cleaned.matchAll(/\{[\s\S]*}/g)];

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[0]);
        if (validateCrashAlert(parsed)) {
          console.log('✅ [Crash Alert JSON 검증 성공]');
          return match[0];
        }
      } catch {
        // 다음 후보 시도
      }
    }

    console.warn('[Crash Alert JSON 추출 실패] 유효한 데이터 없음');
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Crash Alert JSON 파싱 에러] ${msg}`);
    return null;
  }
}