import { GoogleGenAI } from '@google/genai';
import { STOCK_ANALYSIS_PROMPT } from '../prompts/stock-analysis';
import { PIPELINE_CONFIG, GEMINI_API_CONFIG } from './_config/pipeline-config';

/**
 * 단일 Stage 프롬프트 정보
 *
 * @property stageNumber - Stage 번호 (0-5)
 * @property stageName - Stage 이름 (예: "200개 종목 수집")
 * @property prompt - 실행할 프롬프트 전문 (공통 원칙 + Stage 특화 내용)
 * @property requiresPreviousOutput - 이전 Stage 출력 필요 여부 (STAGE 2부터 true)
 */
interface StagePrompt {
  stageNumber: number;
  stageName: string;
  prompt: string;
  requiresPreviousOutput: boolean;
}

/**
 * Promise에 타임아웃 적용
 *
 * 지정된 시간 내에 Promise가 완료되지 않으면 타임아웃 에러를 발생시킵니다.
 *
 * @template T - Promise 반환 타입
 * @param promise - 타임아웃을 적용할 Promise
 * @param ms - 타임아웃 시간 (밀리초)
 * @returns 원본 Promise 또는 타임아웃 에러
 * @throws {Error} "Timeout after {ms}ms" 메시지와 함께 타임아웃 발생
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   apiCall(),
 *   5000  // 5초 타임아웃
 * );
 * ```
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * 전체 프롬프트를 Stage별로 파싱하여 분리
 *
 * STOCK_ANALYSIS_PROMPT를 정규식으로 파싱하여 각 Stage를 개별 프롬프트로 분리합니다.
 * 공통 원칙은 모든 Stage 프롬프트에 포함됩니다.
 *
 * @returns Stage 배열 (각 Stage의 프롬프트와 메타데이터 포함)
 *
 * @example
 * ```typescript
 * const stages = extractStagePrompts();
 * // [
 * //   { stageNumber: 0, stageName: "200개 종목 수집", ... },
 * //   { stageNumber: 1, stageName: "30개 필터링", ... },
 * //   ...
 * // ]
 * ```
 */
function extractStagePrompts(): StagePrompt[] {
  const fullPrompt = STOCK_ANALYSIS_PROMPT;

  // Stage 헤더 패턴: "━━━\nSTAGE 0: 설명\n━━━"
  const stageRegex = /━+\nSTAGE (\d+): ([^\n]+)\n━+/g;
  const matches = [...fullPrompt.matchAll(stageRegex)];
  const stages: StagePrompt[] = [];

  // 공통 원칙 추출 (모든 Stage에 공통으로 전달)
  const firstStageIndex = fullPrompt.indexOf('STAGE 0:');
  const commonPrinciples = fullPrompt.substring(0, firstStageIndex);

  // 각 Stage별로 프롬프트 추출
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const stageNumber = parseInt(currentMatch[1], 10);
    const stageName = currentMatch[2].trim();
    const stageStart = currentMatch.index!;
    const nextStageStart = i < matches.length - 1 ? matches[i + 1].index! : fullPrompt.length;
    const stageContent = fullPrompt.substring(stageStart, nextStageStart);

    stages.push({
      stageNumber,
      stageName,
      prompt: `${commonPrinciples}\n\n${stageContent}`, // 공통 원칙 + Stage 특화 내용
      requiresPreviousOutput: stageNumber >= 2, // STAGE 2부터 이전 결과 필요
    });
  }

  console.log(`📋 총 ${stages.length}개 Stage 감지`);
  return stages;
}

/**
 * 이전 Stage 출력을 현재 Stage 프롬프트에 추가
 *
 * STAGE 2 이상에서 이전 Stage의 결과를 현재 Stage 프롬프트에 연결합니다.
 *
 * @param basePrompt - 기본 Stage 프롬프트
 * @param previousOutput - 이전 Stage 실행 결과
 * @returns 이전 결과가 포함된 최종 프롬프트
 *
 * @example
 * ```typescript
 * const stage2Prompt = appendPreviousOutput(
 *   stage2BasePrompt,
 *   "STAGE 1 결과: 30개 종목 리스트..."
 * );
 * // "STAGE 2 프롬프트\n\n━━━\n📥 이전 STAGE 결과:\n━━━\n\nSTAGE 1 결과: 30개 종목 리스트..."
 * ```
 */
function appendPreviousOutput(basePrompt: string, previousOutput: string): string {
  return `${basePrompt}\n\n${'━'.repeat(80)}\n📥 이전 STAGE 결과:\n${'━'.repeat(80)}\n\n${previousOutput}\n\n이 결과를 바탕으로 현재 STAGE를 진행하세요.\n`;
}

/**
 * 단일 Stage 실행 (Inner Retry Layer)
 *
 * Stage-level retry와 Exponential Backoff를 담당합니다.
 * 각 Stage는 최대 5회까지 재시도하며, 실패 시 다음 Stage로 진행하지 않습니다.
 *
 * Retry 전략:
 * - 최대 5회 재시도 (Exponential Backoff: 5s → 10s → 20s → 40s → 80s)
 * - 429 Rate Limit 시: 10s → 20s → 40s → 80s → 160s (2배)
 * - Stage별 10분 타임아웃
 *
 * @param genAI - GoogleGenAI 인스턴스 (Vertex AI)
 * @param stage - 실행할 Stage 정보
 * @param previousOutput - 이전 Stage 출력 (STAGE 2부터 필요)
 * @returns Stage 실행 결과 텍스트
 * @throws {Error} 최대 재시도 횟수 초과 또는 타임아웃
 *
 * @example
 * ```typescript
 * const stage0Result = await executeStage(genAI, stages[0]);
 * const stage1Result = await executeStage(genAI, stages[1], stage0Result);
 * ```
 */
async function executeStage(
  genAI: GoogleGenAI,
  stage: StagePrompt,
  previousOutput?: string
): Promise<string> {
  console.log(`\n🚀 [STAGE ${stage.stageNumber}] ${stage.stageName}`);

  // 최대 5회 재시도 (Exponential Backoff)
  for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
    try {
      // 이전 Stage 결과가 필요한 경우 프롬프트에 추가
      const finalPrompt = stage.requiresPreviousOutput && previousOutput
        ? appendPreviousOutput(stage.prompt, previousOutput)
        : stage.prompt;

      // Gemini API 호출 (Google Search tool 포함)
      const response = await withTimeout(
        genAI.models.generateContent({
          model: GEMINI_API_CONFIG.MODEL,
          contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
            maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
            temperature: GEMINI_API_CONFIG.TEMPERATURE,
            topP: GEMINI_API_CONFIG.TOP_P,
            topK: GEMINI_API_CONFIG.TOP_K,
            responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
            thinkingConfig: { thinkingBudget: GEMINI_API_CONFIG.THINKING_BUDGET },
          },
        }),
        PIPELINE_CONFIG.STAGE_TIMEOUT
      );

      console.log(`✅ 완료 (${response.text?.length || 0} chars)\n`);
      return response.text || JSON.stringify(response);

    } catch (error) {
      // 최대 재시도 도달 시 에러 throw
      if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) throw error;

      // 429 Rate Limit 에러 감지
      const is429 = String(error).includes('429') || String(error).includes('RESOURCE_EXHAUSTED');

      // Exponential Backoff: 5s → 10s → 20s → 40s → 80s (429는 2배)
      const delay =
        PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY * (is429 ? 2 : 1) * Math.pow(2, attempt - 1);

      console.log(
        `⏳ ${delay / 1000}초 후 재시도 (${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY})${is429 ? ' [429]' : ''}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`STAGE ${stage.stageNumber} 실행 실패`);
}

/**
 * Gemini 6-Stage Pipeline 실행
 *
 * Pipeline 구조:
 * STAGE 0: 200개 종목 수집 (30개 다양한 검색 쿼리)
 *    ↓
 * STAGE 1: 200개 → 30개 필터링 (기술적 분석 기반)
 *    ↓
 * STAGE 2: 전일종가 5개 소스 교차 검증
 *    ↓
 * STAGE 3: 30개 기술적 지표 수집 (TIER 1/2/3)
 *    ↓
 * STAGE 4: 7-카테고리 점수 산정
 *    ↓
 * STAGE 5: 최종 3개 종목 JSON 출력 + 검증
 *
 * @returns JSON 문자열 (3개 종목 데이터)
 * @throws {Error} 환경 변수 미설정, Stage 실행 실패 등
 */
export async function executeGeminiPipeline(): Promise<string> {
  // 환경 변수 검증
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.');
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 Gemini Multi-Stage Pipeline 시작`);
  console.log(`   Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
  console.log(`   Location: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
  console.log(`${'='.repeat(80)}`);

  // GoogleGenAI 초기화 (Vertex AI)
  const genAI = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
  });

  // Stage별 프롬프트 추출
  const stages = extractStagePrompts();
  let previousOutput: string | undefined;

  // 순차적 Pipeline 실행
  for (const stage of stages) {
    const stageOutput = await executeStage(genAI, stage, previousOutput);

    // STAGE 5 (JSON 출력)에 도달하면 종목 수 검증 후 Pipeline 종료
    if (stage.stageNumber === 5) {
      // 🚨 간단한 JSON 종목 수 사전 검증 (Outer Layer 재시도 트리거용)
      try {
        // JSON 배열 추출 시도
        const jsonMatch = stageOutput.match(/\[\s*\{[\s\S]*?}\s*]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            const stockCount = parsed.length;
            console.log(`\n📊 [Stage 5 검증] ${stockCount}개 종목 감지`);

            if (stockCount !== PIPELINE_CONFIG.REQUIRED_STOCK_COUNT) {
              console.error(
                `❌ [Stage 5 실패] ${stockCount}개 종목 (필요: ${PIPELINE_CONFIG.REQUIRED_STOCK_COUNT}개)`
              );
              throw new Error(
                `STAGE 5 실패: ${stockCount}개 종목만 생성됨 (필요: ${PIPELINE_CONFIG.REQUIRED_STOCK_COUNT}개). Pipeline STAGE 0부터 재시도 필요.`
              );
            }
            console.log(`✅ [Stage 5 검증] ${PIPELINE_CONFIG.REQUIRED_STOCK_COUNT}개 종목 확인 완료`);
          }
        }
      } catch (preValidationError) {
        // JSON 파싱 실패 시에도 예외 발생 (Outer Layer에서 재시도)
        const errorMsg =
          preValidationError instanceof Error
            ? preValidationError.message
            : String(preValidationError);
        console.error(`❌ [Stage 5 사전 검증 실패] ${errorMsg}`);
        throw preValidationError;
      }

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🎉 Pipeline 완료!`);
      console.log(`${'='.repeat(80)}\n`);
      return stageOutput;
    }

    // 다음 Stage를 위해 현재 출력 저장
    previousOutput = stageOutput;

    // Stage 간 대기 (Rate Limit 방지)
    if (stage.stageNumber < 5) {
      console.log(`⏸️  다음 Stage 준비 중 (${PIPELINE_CONFIG.STAGE_DELAY / 1000}초 대기)...`);
      await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));
    }
  }

  throw new Error('Pipeline이 STAGE 5에 도달하지 못했습니다.');
}