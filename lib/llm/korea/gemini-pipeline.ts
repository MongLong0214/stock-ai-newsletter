import { GoogleGenAI } from '@google/genai';
import { STOCK_ANALYSIS_PROMPT } from '../../prompts/korea';
import { PIPELINE_CONFIG, GEMINI_API_CONFIG } from '../_config/pipeline-config';

/**
 * 단일 Stage 프롬프트 정보
 *
 * @property stageNumber - Stage 번호 (0-6)
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
        const nextStageStart =
            i < matches.length - 1 ? matches[i + 1].index! : fullPrompt.length;
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
    previousOutput?: string
): Promise<string> {
    console.log(`\n🚀 [STAGE ${stage.stageNumber}] ${stage.stageName}`);

    // 최대 5회 재시도 (Exponential Backoff)
    for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
        try {
            const finalPrompt =
                stage.requiresPreviousOutput && previousOutput
                    ? appendPreviousOutput(stage.prompt, previousOutput)
                    : stage.prompt;

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

            console.log(`✅ 완료 (${response.text?.length || 0} chars)\n`);
            return response.text || JSON.stringify(response);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            console.error(`\n${'━'.repeat(80)}`);
            console.error(
                `❌ [STAGE ${stage.stageNumber} 실패] 시도 ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY}`
            );
            console.error(`${'━'.repeat(80)}`);
            console.error(`에러 메시지: ${errorMsg}`);

            const is429 =
                errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');
            const isTimeout = errorMsg.includes('Timeout');
            const isAuth =
                errorMsg.includes('401') ||
                errorMsg.includes('403') ||
                errorMsg.includes('PERMISSION_DENIED');
            const isNetwork =
                errorMsg.includes('ECONNREFUSED') ||
                errorMsg.includes('ENOTFOUND') ||
                errorMsg.includes('fetch failed');
            const isFetchError = errorMsg.includes('fetch failed');

            if (is429) {
                console.error('📊 에러 타입: Rate Limit 초과 (429)');
                console.error('💡 해결방법: 재시도 대기 시간 2배 적용');
            } else if (isTimeout) {
                console.error('⏱️  에러 타입: 타임아웃 (10분 초과)');
                console.error('💡 해결방법: Stage 복잡도 확인 필요');
            } else if (isAuth) {
                console.error('🔐 에러 타입: 인증/권한 오류');
                console.error('💡 해결방법: GOOGLE_APPLICATION_CREDENTIALS 확인');
            } else if (isFetchError) {
                console.error('🌐 에러 타입: Fetch 실패 (네트워크/API 요청 오류)');
                console.error('💡 가능 원인:');
                console.error('   - Google Search tool 동시 요청 제한');
                console.error('   - 일시적 네트워크 불안정');
                console.error('   - Vertex AI 엔드포인트 응답 지연');
                console.error('💡 해결방법: 자동 재시도 진행 중 (Exponential Backoff)');
            } else if (isNetwork) {
                console.error('🌐 에러 타입: 네트워크 연결 오류');
                console.error('💡 해결방법: 인터넷 연결 및 Vertex AI API 활성화 확인');
            } else {
                console.error('⚠️  에러 타입: 기타');
            }

            if (errorStack && process.env.NODE_ENV === 'development') {
                console.error(`\n스택 트레이스:\n${errorStack}`);
            }
            console.error(`${'━'.repeat(80)}\n`);

            if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) {
                console.error(
                    `🚨 [STAGE ${stage.stageNumber}] 최대 재시도 횟수 도달 - Pipeline 중단\n`
                );
                throw error;
            }

            const delay =
                PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY *
                (is429 ? 2 : 1) *
                Math.pow(2, attempt - 1);

            console.log(
                `⏳ ${delay / 1000}초 후 재시도 (${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY})${
                    is429 ? ' [429 Rate Limit]' : ''
                }\n`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw new Error(`STAGE ${stage.stageNumber} 실행 실패`);
}

/**
 * Gemini 7-Stage Pipeline 실행
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
 *    ↓
 * STAGE 6: 사실관계 재검증 및 JSON 정제
 *
 * @returns JSON 문자열 (3개 종목 데이터)
 */
export async function executeGeminiPipeline(): Promise<string> {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
        throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Gemini Multi-Stage Pipeline 시작`);
    console.log(`   Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
    console.log(`   Location: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
    console.log(`${'='.repeat(80)}`);

    const genAI = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
    });

    const stages = extractStagePrompts();
    let previousOutput: string | undefined;

    for (const stage of stages) {
        const stageOutput = await executeStage(genAI, stage, previousOutput);

        // Stage 6에서 파이프라인 종료
        if (stage.stageNumber === 6) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🎉 Pipeline 완료: 3개 종목 최종 추천`);
            console.log(`${'='.repeat(80)}\n`);
            return stageOutput;
        }

        previousOutput = stageOutput;

        if (stage.stageNumber < 6) {
            console.log(
                `⏸️  다음 Stage 준비 중 (${PIPELINE_CONFIG.STAGE_DELAY / 1000}초 대기)...`
            );
            await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));
        }
    }

    throw new Error('Pipeline이 STAGE 6에 도달하지 못했습니다.');
}
