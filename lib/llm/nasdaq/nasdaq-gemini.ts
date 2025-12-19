import { executeGeminiNasdaqPipeline } from './nasdaq-gemini-pipeline';
import { PIPELINE_CONFIG } from '../_config/pipeline-config';

/**
 * COMPACT TRADER FORMAT (v2.2) - Pick 타입
 */
interface NasdaqPick {
  rank: number;
  ticker: string;
  price: number;
  signal: 'MEAN_REVERSION' | 'TREND_PULLBACK';
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  regime: 'A' | 'B';
  confidence: number;
  score: number;
  indicators: {
    willr: number;
    rsi: number;
    adx: number;
    atr: number;
    ema20: number;
  };
  trigger: string;
  warnings: string[];
}

/**
 * COMPACT TRADER FORMAT (v2.2) - 전체 응답 타입
 */
interface NasdaqCompactResponse {
  timestamp: string;
  version: string;
  dataQuality: {
    source: string;
    fresh: boolean;
    verified: boolean;
  };
  picks: NasdaqPick[];
  summary: {
    totalPicks: number;
    avgConfidence: number | null;
    regimeA: number;
    regimeB: number;
  };
  noPicksReason?: string;
}

/**
 * Pick 검증 (COMPACT FORMAT)
 */
function validatePick(pick: unknown): pick is NasdaqPick {
  if (!pick || typeof pick !== 'object') return false;

  const p = pick as Record<string, unknown>;

  // Required fields
  if (typeof p.rank !== 'number' || p.rank < 1 || p.rank > 3) {
    console.warn(`❌ [Pick 검증 실패] rank 유효하지 않음: ${p.rank}`);
    return false;
  }
  if (typeof p.ticker !== 'string' || p.ticker.length === 0 || p.ticker.length > 5) {
    console.warn(`❌ [Pick 검증 실패] ticker 유효하지 않음: ${p.ticker}`);
    return false;
  }
  if (typeof p.price !== 'number' || p.price <= 0) {
    console.warn(`❌ [Pick 검증 실패] price 유효하지 않음: ${p.ticker}`);
    return false;
  }
  if (!['MEAN_REVERSION', 'TREND_PULLBACK'].includes(p.signal as string)) {
    console.warn(`❌ [Pick 검증 실패] signal 유효하지 않음: ${p.ticker} (${p.signal})`);
    return false;
  }
  if (!['STRONG', 'MODERATE', 'WEAK'].includes(p.strength as string)) {
    console.warn(`❌ [Pick 검증 실패] strength 유효하지 않음: ${p.ticker} (${p.strength})`);
    return false;
  }
  if (!['A', 'B'].includes(p.regime as string)) {
    console.warn(`❌ [Pick 검증 실패] regime 유효하지 않음: ${p.ticker} (${p.regime})`);
    return false;
  }

  // Confidence check (60-100)
  if (typeof p.confidence !== 'number' || p.confidence < 60 || p.confidence > 100) {
    console.warn(`❌ [Pick 검증 실패] confidence 유효하지 않음: ${p.ticker} (${p.confidence})`);
    return false;
  }

  // Score check
  if (typeof p.score !== 'number') {
    console.warn(`❌ [Pick 검증 실패] score 없음: ${p.ticker}`);
    return false;
  }

  // Indicators check
  const indicators = p.indicators as Record<string, unknown> | undefined;
  if (!indicators) {
    console.warn(`❌ [Pick 검증 실패] indicators 없음: ${p.ticker}`);
    return false;
  }

  const requiredIndicators = ['willr', 'rsi', 'adx', 'atr', 'ema20'];
  for (const ind of requiredIndicators) {
    if (typeof indicators[ind] !== 'number') {
      console.warn(`❌ [Pick 검증 실패] indicators.${ind} 없음: ${p.ticker}`);
      return false;
    }
  }

  // Warnings check (should be array)
  if (!Array.isArray(p.warnings)) {
    console.warn(`❌ [Pick 검증 실패] warnings가 배열이 아님: ${p.ticker}`);
    return false;
  }

  console.log(`✅ [Pick 검증 성공] ${p.ticker} ($${p.price}) | ${p.signal} | Confidence: ${p.confidence}`);
  return true;
}

/**
 * COMPACT FORMAT 검증
 */
function validateCompactFormat(data: unknown): data is NasdaqCompactResponse {
  if (!data || typeof data !== 'object') return false;

  const response = data as Record<string, unknown>;

  // Required root fields
  if (typeof response.timestamp !== 'string') {
    console.warn(`❌ [검증 실패] timestamp 없음`);
    return false;
  }
  if (typeof response.version !== 'string') {
    console.warn(`❌ [검증 실패] version 없음`);
    return false;
  }

  // dataQuality 검증
  const dq = response.dataQuality as Record<string, unknown> | undefined;
  if (!dq || typeof dq.fresh !== 'boolean' || typeof dq.verified !== 'boolean') {
    console.warn(`❌ [검증 실패] dataQuality 유효하지 않음`);
    return false;
  }

  // picks 검증
  const picks = response.picks;
  if (!Array.isArray(picks)) {
    console.warn(`❌ [검증 실패] picks가 배열이 아님`);
    return false;
  }

  // 0~3개의 picks 허용
  if (picks.length > 3) {
    console.warn(`❌ [검증 실패] picks가 3개 초과: ${picks.length}개`);
    return false;
  }

  // 각 pick 검증
  for (const pick of picks) {
    if (!validatePick(pick)) {
      return false;
    }
  }

  // summary 검증
  const summary = response.summary as Record<string, unknown> | undefined;
  if (!summary || typeof summary.totalPicks !== 'number') {
    console.warn(`❌ [검증 실패] summary 유효하지 않음`);
    return false;
  }

  console.log(`✅ [COMPACT FORMAT 검증 성공] ${picks.length}개 종목`);
  return true;
}

/**
 * JSON 추출 및 검증 (COMPACT TRADER FORMAT v2.2)
 */
function extractAndValidateJSON(text: string): string | null {
  if (!text?.trim()) {
    console.warn('[JSON 추출 실패] 빈 응답');
    return null;
  }

  try {
    // Clean control characters
    const cleaned = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/<ctrl\d+>/g, '')
      .replace(/call:google_search\.search\{[^}]*}/g, '');

    // JSON 추출 시도
    let parsed: unknown = null;

    // 1. ```json ... ``` 마크다운 블록 추출
    const jsonBlockMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        parsed = JSON.parse(jsonBlockMatch[1]);
      } catch {
        // continue
      }
    }

    // 2. 전체 텍스트가 JSON인 경우
    if (!parsed) {
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // continue
      }
    }

    // 3. picks 키워드로 객체 찾기 (COMPACT FORMAT)
    if (!parsed) {
      const compactMatch = cleaned.match(/\{[\s\S]*"picks"[\s\S]*\}/);
      if (compactMatch) {
        try {
          parsed = JSON.parse(compactMatch[0]);
        } catch {
          // continue
        }
      }
    }

    if (!parsed) {
      console.warn(`[JSON 추출 실패] JSON 객체를 찾을 수 없음`);
      console.warn(`[응답 시작 부분] ${text.substring(0, 300)}...`);
      return null;
    }

    // COMPACT FORMAT 검증
    if (validateCompactFormat(parsed)) {
      console.log(`✅ [JSON 검증 성공] COMPACT FORMAT`);
      return JSON.stringify(parsed);
    }

    console.warn(`[JSON 추출 실패] 유효한 COMPACT FORMAT이 아님`);
    console.warn(`[응답 시작 부분] ${text.substring(0, 300)}...`);
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
 * Pipeline 구조 (v2.2 COMPACT TRADER FORMAT):
 * - STAGE 0: 200개 NASDAQ 종목 수집
 * - STAGE 1: 200개 → 30개 필터링
 * - STAGE 2: 가격 검증 (Abnormal Gap Detection)
 * - STAGE 3: 지표 직접 계산
 * - STAGE 4: 스코어링 + Confidence Assessment
 * - STAGE 5: Compact JSON Output
 * - STAGE 6: Final Verification
 *
 * @returns 유효한 JSON 문자열 (COMPACT FORMAT) 또는 에러 메시지
 */
export async function getNasdaqGeminiRecommendation(): Promise<string> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    return '⚠️ GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.';
  }

  console.log(
    `[Gemini NASDAQ] Using Vertex AI Pipeline v2.2 (Project: ${process.env.GOOGLE_CLOUD_PROJECT})`
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
      console.log(`📥 [NASDAQ Pipeline 응답] (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
      console.log(`${'━'.repeat(80)}`);
      console.log(result);
      console.log(`${'━'.repeat(80)}\n`);

      const validJSON = extractAndValidateJSON(result);

      if (validJSON) {
        console.log(
          `✅ [NASDAQ Pipeline] 유효한 JSON (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
        );
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