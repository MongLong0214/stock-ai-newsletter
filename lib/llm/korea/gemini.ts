import { createHash } from 'node:crypto';
import {
  createGeminiExecutionBudget,
  executeGeminiPipeline,
  executeMarketAssessment,
  executeCrashAnalysisPipeline,
  getStockPromptManifest,
} from './gemini-pipeline';
import type { MarketAssessment, PromptManifest } from './gemini-pipeline';
import type { LlmExecutionBudget } from '../execution-budget';
import { GEMINI_API_CONFIG, PIPELINE_CONFIG } from '../_config/pipeline-config';
import { extractAndValidateJSON, extractAndValidateCrashJSON } from './stock-json';
import { verifyGeneratedStockClaims } from './stock-claims-verifier';
import type { VerifiedStockClaims, VerifiedStockClaimEvidence } from './stock-claims-verifier';

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
 * @returns 유효한 JSON 문자열
 * @throws 환경 변수 미설정, 최대 재시도 횟수 초과
 *
 * @example
 * ```typescript
 * const result = await getGeminiRecommendation();
 * const stocks = JSON.parse(result);
 * ```
 */
export interface GeminiRecommendationResult {
  readonly geminiAnalysis: string;
  readonly generationKind: 'stock_recommendation' | 'crash_alert';
  readonly modelVersion: string;
  readonly promptManifest: PromptManifest;
  readonly groundingEvidence: readonly (VerifiedStockClaimEvidence | {
    readonly source: 'KIS_market_assessment';
    readonly sourceUrl: string;
    readonly observedAt: string;
  })[];
  readonly startedAt: string;
  readonly completedAt: string;
}

const crashPromptManifest = (assessmentSummary: string): PromptManifest => ({
  version: 'korea-crash-analysis-v1',
  sha256: createHash('sha256')
    .update(JSON.stringify({ contract: 'korea-crash-analysis-v1', assessmentSummary }), 'utf8')
    .digest('hex'),
});

/** Full result including immutable generation provenance. */
export async function getGeminiRecommendationResult(signal?: AbortSignal): Promise<GeminiRecommendationResult> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.');
  }

  const executionDate = new Date();
  const startedAt = executionDate.toISOString();
  const budget = createGeminiExecutionBudget(signal);
  console.log(
    `[Gemini] Using Vertex AI Multi-Stage Pipeline (Project: ${process.env.GOOGLE_CLOUD_PROJECT})`
  );

  try {
    // ━━━━━ Step 1: 시장 평가 (대폭락 가능성 판정) ━━━━━
    const assessment: MarketAssessment = await executeMarketAssessment(budget);

    // ━━━━━ Step 2: 분기 — CRASH_ALERT / ABSTAIN / DEGRADED / NORMAL ━━━━━
    if (assessment.suppressRecommendation) {
      if (assessment.verdict === 'CRASH_ALERT') {
        console.log(`\n🚨 [CRASH_ALERT] 대폭락 예상 → 폭락 분석 Pipeline 실행`);
        const geminiAnalysis = await executeCrashAnalysisWithRetry(assessment.summary, budget);
        return {
          geminiAnalysis,
          generationKind: 'crash_alert',
          modelVersion: GEMINI_API_CONFIG.MODEL,
          promptManifest: crashPromptManifest(assessment.summary),
          groundingEvidence: [{
            source: 'KIS_market_assessment',
            sourceUrl: 'https://openapi.koreainvestment.com/uapi/',
            observedAt: new Date().toISOString(),
          }],
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
      // ABSTAIN or DEGRADED: do not proceed with stock recommendations
      console.error(`\n⛔ [${assessment.verdict}] 시장 상태 판정 불가/불확실 — 추천 억제`);
      console.error(`   사유: ${assessment.summary}`);
      throw new Error(
        `Market assessment ${assessment.verdict}: 시장 상태 판정 불가로 추천 생성을 억제합니다. ${assessment.summary}`
      );
    }

    console.log(`\n✅ [NORMAL] 시장 정상 → 종목 추천 Pipeline 실행`);

    const verified = await executeStockPipelineWithRetry(budget, executionDate);
    return {
      geminiAnalysis: verified.json,
      generationKind: 'stock_recommendation',
      modelVersion: GEMINI_API_CONFIG.MODEL,
      promptManifest: getStockPromptManifest(executionDate),
      groundingEvidence: verified.evidence,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ [Pipeline Error]', error);
    throw error instanceof Error ? error : new Error(formatError(error));
  }
}

/** Backward-compatible content-only API. Persistence code should use the full result. */
export async function getGeminiRecommendation(signal?: AbortSignal): Promise<string> {
  return (await getGeminiRecommendationResult(signal)).geminiAnalysis;
}

/**
 * 폭락 분석 Pipeline (Outer Retry)
 */
async function executeCrashAnalysisWithRetry(
  assessmentSummary: string,
  budget: LlmExecutionBudget,
): Promise<string> {
  for (let attempt = 1; attempt <= PIPELINE_CONFIG.OUTER_MAX_RETRY; attempt++) {
    const retryDelay = Math.min(
      PIPELINE_CONFIG.OUTER_BASE_RETRY_DELAY * Math.pow(2, attempt - 1),
      PIPELINE_CONFIG.OUTER_MAX_RETRY_DELAY
    );

    console.log(`[Crash Analysis] 시도 ${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}`);

    try {
      const result = await executeCrashAnalysisPipeline(assessmentSummary, budget);
      if (!result) throw new Error('Empty response from Crash Analysis Pipeline');

      console.log(`\n${'━'.repeat(80)}`);
      console.log(`📥 [Crash Analysis 최종 응답] (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
      console.log(`${'━'.repeat(80)}`);
      console.log(result);
      console.log(`${'━'.repeat(80)}\n`);

      const validJSON = extractAndValidateCrashJSON(result);

      if (validJSON) {
        console.log(`✅ [Crash Analysis] 유효한 JSON 응답 받음`);
        return validJSON;
      }

      console.warn(`⚠️ [Crash Analysis] JSON 검증 실패 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);

      if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
        console.log(`🔄 ${retryDelay / 1000}초 후 재시도...`);
        await budget.sleep(retryDelay);
      }
    } catch (pipelineError) {
      const errorMsg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      console.warn(`⚠️ [Crash Analysis] 오류 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}): ${errorMsg}`);

      if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
        console.log(`🔄 ${retryDelay / 1000}초 후 재시도...`);
        await budget.sleep(retryDelay);
      } else {
        throw pipelineError;
      }
    }
  }

  throw new Error(`Crash Analysis JSON 검증 실패: ${PIPELINE_CONFIG.OUTER_MAX_RETRY}번 시도 후에도 올바른 응답을 받지 못했습니다.`);
}

/**
 * 종목 추천 Pipeline (기존 로직, Outer Retry)
 */
async function executeStockPipelineWithRetry(
  budget: LlmExecutionBudget,
  executionDate: Date,
): Promise<VerifiedStockClaims> {
  for (let attempt = 1; attempt <= PIPELINE_CONFIG.OUTER_MAX_RETRY; attempt++) {
    const retryDelay = Math.min(
      PIPELINE_CONFIG.OUTER_BASE_RETRY_DELAY * Math.pow(2, attempt - 1),
      PIPELINE_CONFIG.OUTER_MAX_RETRY_DELAY
    );

    console.log(`[Gemini Pipeline] 시도 ${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY}`);

    try {
      const result = await executeGeminiPipeline(budget, executionDate);
      if (!result) throw new Error('Empty response from Pipeline');

      console.log(`\n${'━'.repeat(80)}`);
      console.log(`📥 [Pipeline 최종 응답] (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`);
      console.log(`${'━'.repeat(80)}`);
      console.log(result);
      console.log(`${'━'.repeat(80)}\n`);

      const validJSON = extractAndValidateJSON(result);

      if (validJSON) {
        const verified = await verifyGeneratedStockClaims(validJSON);
        console.log(
          `✅ [Pipeline] deterministic claim 검증 완료 (${verified.evidence.length}개 종목, 시도 ${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
        );
        return verified;
      }

      console.warn(
        `⚠️ [Pipeline] JSON 검증 실패 (${attempt}/${PIPELINE_CONFIG.OUTER_MAX_RETRY})`
      );

      if (attempt < PIPELINE_CONFIG.OUTER_MAX_RETRY) {
        console.log(`🔄 [Pipeline] ${retryDelay / 1000}초 후 재시도...`);
        await budget.sleep(retryDelay);
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
        await budget.sleep(retryDelay);
      } else {
        throw pipelineError;
      }
    }
  }

  throw new Error(
    `JSON 검증 실패: ${PIPELINE_CONFIG.OUTER_MAX_RETRY}번 시도 후에도 올바른 응답을 받지 못했습니다.`
  );
}
