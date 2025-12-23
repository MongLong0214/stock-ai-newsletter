import { executeGeminiPipeline } from './gemini-pipeline';
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
 *
 * @example
 * ```typescript
 * const response: unknown = JSON.parse(jsonString);
 * if (validateStockData(response)) {
 *   // response는 이제 StockDataArray 타입으로 추론됨
 *   console.log(response[0].ticker); // Type-safe
 * }
 * ```
 */
function validateStockData(data: unknown): data is StockDataArray {
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
 *
 * @example
 * ```typescript
 * const geminiResponse = "검증 완료\n[{\"ticker\":\"KOSPI:005930\",...}]\n설명...";
 * const json = extractAndValidateJSON(geminiResponse);
 * // json = "[{\"ticker\":\"KOSPI:005930\",...}]"
 * ```
 */
function extractAndValidateJSON(text: string): string | null {
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
 * 에러 포맷팅
 *
 * Gemini API 에러를 사용자 친화적인 메시지로 변환합니다.
 *
 * @param error - 에러 객체 (Error | unknown)
 * @returns 포맷된 에러 메시지
 *
 * @example
 * ```typescript
 * try {
 *   await geminiAPI();
 * } catch (error) {
 *   console.error(formatError(error)); // "⚠️ 응답 시간 초과"
 * }
 * ```
 */
function formatError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes('timeout')) return '⚠️ 응답 시간 초과';
  if (msg.includes('401') || msg.includes('API_KEY')) return '⚠️ API 인증 오류';
  if (msg.includes('429') || msg.includes('quota')) return '⚠️ API 사용량 한도 초과';
  if (msg.includes('404')) return '⚠️ 모델을 찾을 수 없음';

  return `⚠️ Gemini 오류: ${msg}`;
}

/**
 * Gemini Multi-Stage Pipeline 실행 (Outer Retry Layer)
 *
 * 3-Layer Resilience Architecture의 최상위 레이어로,
 * Pipeline 전체 실패 또는 JSON 검증 실패 시 재시도를 담당합니다.
 *
 * Pipeline 구조:
 * - STAGE 0: 200개 종목 수집 (30개 다양한 검색 쿼리)
 * - STAGE 1: 200개 → 30개 필터링 (기술적 분석 기반)
 * - STAGE 2: 전일종가 5개 소스 교차 검증
 * - STAGE 3: 30개 기술적 지표 수집 (TIER 1/2/3)
 * - STAGE 4: 7-카테고리 점수 산정
 * - STAGE 5: 최종 3개 종목 JSON 출력 + 검증
 *
 * Retry 전략:
 * - 최대 3회 재시도 (Exponential Backoff: 2s → 4s → 8s)
 * - JSON 검증 실패 또는 Pipeline 오류 시 전체 재실행
 * - 429 Rate Limit 에러 자동 감지 및 처리
 *
 * @returns 유효한 JSON 문자열 (1-3개 종목) 또는 에러 메시지
 * @throws 환경 변수 미설정, 최대 재시도 횟수 초과
 *
 * @example
 * ```typescript
 * const result = await getGeminiRecommendation();
 * if (result.startsWith('[')) {
 *   // 성공: JSON 문자열
 *   const stocks = JSON.parse(result);
 * } else {
 *   // 실패: 에러 메시지
 *   console.error(result); // "⚠️ 응답 시간 초과"
 * }
 * ```
 */
export async function getGeminiRecommendation(): Promise<string> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    return '⚠️ GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.';
  }

  console.log(
    `[Gemini] Using Vertex AI Multi-Stage Pipeline (Project: ${process.env.GOOGLE_CLOUD_PROJECT})`
  );

  try {
    for (let attempt = 1; attempt <= PIPELINE_CONFIG.OUTER_MAX_RETRY; attempt++) {
      const retryDelay = Math.min(
        PIPELINE_CONFIG.OUTER_BASE_RETRY_DELAY * Math.pow(2, attempt - 1),
        PIPELINE_CONFIG.OUTER_MAX_RETRY_DELAY
      );

      console.log(`[Gemini Pipeline] 시도 ${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}`);

      try {
        const result = await executeGeminiPipeline();
        if (!result) throw new Error('Empty response from Pipeline');

        // 응답 로깅
        console.log(`\n${'━'.repeat(80)}`);
        console.log(`📥 [Pipeline 최종 응답] (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
        console.log(`${'━'.repeat(80)}`);
        console.log(result);
        console.log(`${'━'.repeat(80)}\n`);

        // JSON 추출 및 검증
        const validJSON = extractAndValidateJSON(result);

        if (validJSON) {
          console.log(
            `✅ [Pipeline] 유효한 JSON 응답 받음 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
          );
          if (validJSON !== result) {
            console.log(`📦 [추출된 JSON]:\n${validJSON}\n`);
          }
          return validJSON;
        }

        console.warn(
          `⚠️ [Pipeline] JSON 검증 실패 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
        );

        if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
          console.log(`🔄 [Pipeline] ${retryDelay / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      } catch (pipelineError) {
        const errorMsg =
          pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
        const is429 = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');

        console.warn(
          `⚠️ [Pipeline] 오류 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}): ${errorMsg}`
        );
        if (is429) console.log(`🔍 [429 Error] Quota 초과 감지`);

        if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
          console.log(`🔄 [Pipeline] ${retryDelay / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw pipelineError;
        }
      }
    }

    throw new Error(
      `JSON 검증 실패: ${PIPELINE_CONFIG.OUTER_MAX_RETRY}번 시도 후에도 올바른 응답을 받지 못했습니다.`
    );
  } catch (error) {
    console.error('❌ [Pipeline Error]', error);
    return formatError(error);
  }
}