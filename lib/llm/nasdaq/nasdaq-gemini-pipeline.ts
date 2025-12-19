import { GoogleGenAI } from '@google/genai';
import { COMMON_PRINCIPLES } from '../../prompts/nasdaq/common-principles';
import { STAGE_0_COLLECT_CANDIDATES } from '../../prompts/nasdaq/stage-0-collect-200';
import { STAGE_1_SCREENING_50 } from '../../prompts/nasdaq/stage-1-filter-30';
import { STAGE_2_VERIFY_PRICE } from '../../prompts/nasdaq/stage-2-verify-price';
import { STAGE_3_PROCESS_CLASSIFICATION } from '../../prompts/nasdaq/stage-3-collect-indicators';
import { STAGE_4_STOPLOSS_AND_FINAL } from '../../prompts/nasdaq/stage-4-calculate-scores';
import { STAGE_5_JSON_OUTPUT } from '../../prompts/nasdaq/stage-5-json-output';
import { STAGE_6_FINAL_VERIFICATION } from '../../prompts/nasdaq/stage-6-final-verification';
import { PIPELINE_CONFIG, GEMINI_API_CONFIG } from '../_config/pipeline-config';

/**
 * 단일 Stage 프롬프트 정보
 */
interface StagePrompt {
  stageNumber: number;
  stageName: string;
  shortDesc: string;
  prompt: string;
  requiresPreviousOutput: boolean;
}

/**
 * 진행률 바 생성
 */
function progressBar(current: number, total: number, width: number = 20): string {
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${current}/${total}`;
}

/**
 * 경과 시간 포맷
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Stage 출력 요약 추출
 */
function extractStageSummary(stageNumber: number, output: string): string {
  try {
    // Stage별로 다른 요약 추출
    switch (stageNumber) {
      case 0: {
        // 수집된 종목 수 추출
        const countMatch = output.match(/(\d+)\s*(stocks?|종목|symbols?)/i);
        return countMatch ? `${countMatch[1]} stocks collected` : 'Stocks collected';
      }
      case 1: {
        // 필터링 후 종목 수
        const filtered = output.match(/(\d+)\s*(stocks?|종목|candidates?)/i);
        return filtered ? `Filtered to ${filtered[1]} stocks` : 'Filtering complete';
      }
      case 2: {
        // 검증/격리 결과
        const verified = output.match(/verified.*?(\d+)/i);
        const quarantine = output.match(/quarantine.*?(\d+)/i);
        return `Verified: ${verified?.[1] ?? '?'}, Quarantined: ${quarantine?.[1] ?? '0'}`;
      }
      case 3: {
        // 지표 계산 완료
        return 'Indicators calculated (WillR, RSI, ADX, ATR, EMA20)';
      }
      case 4: {
        // 스코어링 결과
        const triggered = output.match(/trigger.*?(\d+)/i);
        return `Trigger hits: ${triggered?.[1] ?? '?'}, Scoring complete`;
      }
      case 5: {
        // JSON 출력
        const picks = output.match(/"picks"\s*:\s*\[/);
        return picks ? 'JSON formatted' : 'Output generated';
      }
      case 6: {
        // 최종 검증
        return 'Final verification complete';
      }
      default:
        return 'Complete';
    }
  } catch {
    return 'Complete';
  }
}

/**
 * Promise에 타임아웃 적용
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
 * NASDAQ 7-Stage Pipeline 정의 (명시적)
 */
function getStagePrompts(): StagePrompt[] {
  const stages: StagePrompt[] = [
    {
      stageNumber: 0,
      stageName: 'Collect Universe',
      shortDesc: 'Fetching NASDAQ symbols & OHLCV data',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_0_COLLECT_CANDIDATES}`,
      requiresPreviousOutput: false,
    },
    {
      stageNumber: 1,
      stageName: 'Filter Candidates',
      shortDesc: 'Applying price & liquidity filters',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_1_SCREENING_50}`,
      requiresPreviousOutput: true,
    },
    {
      stageNumber: 2,
      stageName: 'Verify Prices',
      shortDesc: 'Detecting abnormal gaps & data issues',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_2_VERIFY_PRICE}`,
      requiresPreviousOutput: true,
    },
    {
      stageNumber: 3,
      stageName: 'Calculate Indicators',
      shortDesc: 'Computing WillR, RSI, ADX, ATR, EMA20',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_3_PROCESS_CLASSIFICATION}`,
      requiresPreviousOutput: true,
    },
    {
      stageNumber: 4,
      stageName: 'Score & Rank',
      shortDesc: 'Applying trigger logic & confidence scoring',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_4_STOPLOSS_AND_FINAL}`,
      requiresPreviousOutput: true,
    },
    {
      stageNumber: 5,
      stageName: 'Format Output',
      shortDesc: 'Generating compact trader JSON',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_5_JSON_OUTPUT}`,
      requiresPreviousOutput: true,
    },
    {
      stageNumber: 6,
      stageName: 'Final Verification',
      shortDesc: 'Running 7-layer sanity checks',
      prompt: `${COMMON_PRINCIPLES}\n\n${STAGE_6_FINAL_VERIFICATION}`,
      requiresPreviousOutput: true,
    },
  ];

  return stages;
}

/**
 * 이전 Stage 출력을 현재 Stage 프롬프트에 추가
 */
function appendPreviousOutput(basePrompt: string, previousOutput: string): string {
  return `${basePrompt}\n\n${'━'.repeat(80)}\n📥 이전 STAGE 결과:\n${'━'.repeat(80)}\n\n${previousOutput}\n\n이 결과를 바탕으로 현재 STAGE를 진행하세요.\n`;
}

/**
 * 단일 Stage 실행 (Inner Retry Layer)
 */
async function executeStage(
  genAI: GoogleGenAI,
  stage: StagePrompt,
  stageIndex: number,
  totalStages: number,
  previousOutput?: string
): Promise<string> {
  const stageStart = Date.now();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📍 STAGE ${stage.stageNumber}: ${stage.stageName}`);
  console.log(`   ${stage.shortDesc}`);
  console.log(`   ${progressBar(stageIndex + 1, totalStages)}`);
  console.log(`${'─'.repeat(60)}`);

  for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
    try {
      console.log(`   ⏳ Calling Gemini API...`);

      const finalPrompt =
        stage.requiresPreviousOutput && previousOutput
          ? appendPreviousOutput(stage.prompt, previousOutput)
          : stage.prompt;

      const promptSize = finalPrompt.length;
      console.log(`   📤 Prompt size: ${(promptSize / 1024).toFixed(1)}KB`);

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
          },
        }),
        PIPELINE_CONFIG.STAGE_TIMEOUT
      );

      const responseText = response.text || JSON.stringify(response);
      const duration = Date.now() - stageStart;
      const summary = extractStageSummary(stage.stageNumber, responseText);

      console.log(`   📥 Response: ${(responseText.length / 1024).toFixed(1)}KB`);
      console.log(`   ⏱️  Duration: ${formatDuration(duration)}`);
      console.log(`   📊 Result: ${summary}`);
      console.log(`   ✅ STAGE ${stage.stageNumber} COMPLETE`);

      return responseText;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      const is429 =
        errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
      const isTimeout = errorMsg.includes('Timeout');

      console.log(`   ❌ Attempt ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY} failed`);

      if (is429) {
        console.log(`   🔴 Rate limit exceeded (429)`);
      } else if (isTimeout) {
        console.log(`   🔴 Request timed out`);
      } else {
        console.log(`   🔴 Error: ${errorMsg.substring(0, 100)}`);
      }

      if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) {
        console.log(`   🚨 STAGE ${stage.stageNumber} FAILED - Max retries reached`);
        throw error;
      }

      const delay =
        PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY *
        (is429 ? 2 : 1) *
        Math.pow(2, attempt - 1);

      console.log(`   ⏳ Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`NASDAQ STAGE ${stage.stageNumber} 실행 실패`);
}

/**
 * NASDAQ Gemini 7-Stage Pipeline 실행
 */
export async function executeGeminiNasdaqPipeline(): Promise<string> {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.');
  }

  const pipelineStart = Date.now();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🇺🇸 NASDAQ GEMINI PIPELINE v2.2`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   📅 ${new Date().toISOString()}`);
  console.log(`   🔧 Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
  console.log(`   🌐 Location: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
  console.log(`   🤖 Model: ${GEMINI_API_CONFIG.MODEL}`);
  console.log(`${'═'.repeat(60)}`);

  const genAI = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
  });

  const stages = getStagePrompts();
  const totalStages = stages.length;

  console.log(`\n📋 Pipeline Stages (${totalStages} total):`);
  stages.forEach((s, i) => {
    console.log(`   ${i + 1}. [Stage ${s.stageNumber}] ${s.stageName}`);
  });

  let previousOutput: string | undefined;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageOutput = await executeStage(genAI, stage, i, totalStages, previousOutput);

    if (stage.stageNumber === 6) {
      const totalDuration = Date.now() - pipelineStart;

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🎉 PIPELINE COMPLETE`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`   ⏱️  Total time: ${formatDuration(totalDuration)}`);
      console.log(`   📊 Stages completed: ${totalStages}/${totalStages}`);
      console.log(`${'═'.repeat(60)}\n`);

      return stageOutput;
    }

    previousOutput = stageOutput;

    // Stage 간 대기
    if (stage.stageNumber < 6) {
      const delaySeconds = PIPELINE_CONFIG.STAGE_DELAY / 1000;
      console.log(`\n   ⏸️  Next stage in ${delaySeconds}s...`);
      await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));
    }
  }

  throw new Error('NASDAQ Pipeline이 STAGE 6에 도달하지 못했습니다.');
}