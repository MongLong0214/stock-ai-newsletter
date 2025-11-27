import { executeGeminiNasdaqPipeline } from './gemini-pipeline';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';
import type { StockSignals } from '../_types/stock-data';

/**
 * NASDAQ 주식 데이터 타입
 */
interface NasdaqStockData {
  ticker: string;
  name: string;
  close_price: number;
  rationale: string;
  signals: StockSignals;
}

type NasdaqStockDataArray = [NasdaqStockData, NasdaqStockData, NasdaqStockData];

/**
 * 주식 신호 데이터 검증 (Type Guard)
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
 * NASDAQ 주식 데이터 검증 (Type Guard)
 *
 * 검증 항목:
 * - 배열 타입 (정확히 3개 항목만 허용)
 * - ticker: "NASDAQ:XXXX" 형식 (알파벳 심볼)
 * - name: 비어있지 않은 문자열
 * - close_price: 양수 (소수점 허용)
 * - rationale: 50자 이상 문자열
 * - signals: 7개 점수 (0-100)
 */
function validateNasdaqStockData(data: unknown): data is NasdaqStockDataArray {
  if (!Array.isArray(data) || data.length !== PIPELINE_CONFIG.REQUIRED_STOCK_COUNT) {
    if (Array.isArray(data) && data.length > 0) {
      console.warn(
        `❌ [검증 실패] 종목 수 부족: ${data.length}개 (필요: ${PIPELINE_CONFIG.REQUIRED_STOCK_COUNT}개)`
      );
    }
    return false;
  }

  return data.every((item): item is NasdaqStockData => {
    if (!item || typeof item !== 'object') return false;

    const candidate = item as Record<string, unknown>;
    const { ticker, name, close_price, rationale, signals } = candidate;

    // NASDAQ 티커 형식 검증: NASDAQ:AAPL, NASDAQ:MSFT, NASDAQ:GOOGL 등
    // 1-5자리 대문자 알파벳 (숫자 포함 티커는 드물지만 허용)
    if (typeof ticker !== 'string' || !/^NASDAQ:[A-Z]{1,5}$/.test(ticker)) {
      console.warn(`❌ [검증 실패] 잘못된 티커 형식: ${ticker}`);
      return false;
    }
    if (typeof name !== 'string' || name.length === 0) {
      console.warn(`❌ [검증 실패] 잘못된 종목명: ${name}`);
      return false;
    }
    if (typeof close_price !== 'number' || close_price <= 0) {
      console.warn(`❌ [검증 실패] 잘못된 종가: ${close_price}`);
      return false;
    }
    if (typeof rationale !== 'string' || rationale.length < 50) {
      console.warn(
        `❌ [검증 실패] rationale 길이 부족: ${typeof rationale === 'string' ? rationale.length : 0}자`
      );
      return false;
    }

    if (!isValidStockSignals(signals)) {
      console.warn(`❌ [검증 실패] 잘못된 signals 데이터`);
      return false;
    }

    return true;
  });
}

/**
 * JSON 추출 및 검증 (NASDAQ용)
 */
function extractAndValidateJSON(text: string): string | null {
  if (!text?.trim()) {
    console.warn('[JSON 추출 실패] 빈 응답');
    return null;
  }

  try {
    const cleaned = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/<ctrl\d+>/g, '')
      .replace(/call:google_search\.search\{[^}]*}/g, '');

    const matches = [...cleaned.matchAll(/\[\s*\{[\s\S]*?}\s*]/g)];

    if (matches.length === 0) {
      console.warn('[JSON 추출 실패] JSON 배열 패턴을 찾을 수 없음');
      console.warn(`[응답 내용] ${text.substring(0, 200)}...`);
      return null;
    }

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match[0]);
        if (validateNasdaqStockData(parsed)) {
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
 * NASDAQ용 Gemini Multi-Stage Pipeline 실행
 *
 * Pipeline 구조:
 * - STAGE 0: 200개 NASDAQ 종목 수집
 * - STAGE 1: 200개 → 30개 필터링
 * - STAGE 2: 전일종가 5개 소스 교차 검증
 * - STAGE 3: 30개 기술적 지표 수집
 * - STAGE 4: 7-카테고리 점수 산정
 * - STAGE 5: 최종 3개 종목 JSON 출력 + 검증
 * - STAGE 6: 사실관계 재검증 및 JSON 정제
 *
 * @returns 유효한 JSON 문자열 (3개 종목) 또는 에러 메시지
 */
export async function getNasdaqGeminiRecommendation(): Promise<string> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    return '⚠️ GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.';
  }

  console.log(
    `[Gemini NASDAQ] Using Vertex AI Multi-Stage Pipeline (Project: ${process.env.GOOGLE_CLOUD_PROJECT})`
  );

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.OUTER_MAX_RETRY; attempt++) {
    const retryDelay = Math.min(
      PIPELINE_CONFIG.OUTER_BASE_RETRY_DELAY * Math.pow(2, attempt - 1),
      PIPELINE_CONFIG.OUTER_MAX_RETRY_DELAY
    );

    console.log(`[Gemini NASDAQ Pipeline] 시도 ${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}`);

    try {
      const result = await executeGeminiNasdaqPipeline();

      if (!result) {
        console.warn(`⚠️ [NASDAQ Pipeline] 빈 응답 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
        lastError = new Error('Empty response from Pipeline');

        if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
          console.log(`🔄 [NASDAQ Pipeline] ${retryDelay / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
        continue;
      }

      console.log(`\n${'━'.repeat(80)}`);
      console.log(`📥 [NASDAQ Pipeline 최종 응답] (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
      console.log(`${'━'.repeat(80)}`);
      console.log(result);
      console.log(`${'━'.repeat(80)}\n`);

      const validJSON = extractAndValidateJSON(result);

      if (validJSON) {
        console.log(
          `✅ [NASDAQ Pipeline] 유효한 JSON 응답 받음 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
        );
        if (validJSON !== result) {
          console.log(`📦 [추출된 JSON]:\n${validJSON}\n`);
        }
        return validJSON;
      }

      console.warn(
        `⚠️ [NASDAQ Pipeline] JSON 검증 실패 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
      );
      lastError = new Error('JSON validation failed');

      if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
        console.log(`🔄 [NASDAQ Pipeline] ${retryDelay / 1000}초 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    } catch (pipelineError) {
      lastError = pipelineError;
      const errorMsg =
        pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      const is429 = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');

      console.warn(
        `⚠️ [NASDAQ Pipeline] 오류 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}): ${errorMsg}`
      );
      if (is429) console.log(`🔍 [429 Error] Quota 초과 감지`);

      if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
        console.log(`🔄 [NASDAQ Pipeline] ${retryDelay / 1000}초 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.error('❌ [NASDAQ Pipeline Error]', lastError);
  return formatError(
    lastError ?? new Error(`${PIPELINE_CONFIG.OUTER_MAX_RETRY}번 시도 후 실패`)
  );
}