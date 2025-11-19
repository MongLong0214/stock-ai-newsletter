import { GoogleGenAI } from '@google/genai';
import { STOCK_ANALYSIS_PROMPT } from '../prompts/stock-analysis';
import { PIPELINE_CONFIG, GEMINI_API_CONFIG } from './_config/pipeline-config';

/**
 * 단일 Stage 프롬프트 정보
 *
 * @property stageNumber - Stage 번호 (0-7)
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
 * Stage 7 검증 결과
 *
 * @property success      - 검증 성공 여부 (full/partial 모두 true)
 * @property stockCount   - 통과한 종목 수 (2 또는 3)
 * @property rejectedCount- 기각된 종목 수
 * @property message      - 검증 결과 메시지
 * @property shouldRetry  - Pipeline 전체 재시작 필요 여부 (fail일 때 true)
 * @property mode         - 'full' | 'partial' | 'fail'
 */
interface Stage7ValidationResult {
    success: boolean;
    stockCount: number;
    rejectedCount: number;
    message: string;
    shouldRetry: boolean;
    mode: 'full' | 'partial' | 'fail';
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
 * Stage 7 JSON 검증 (부분 수용 정책 반영)
 *
 * 정책:
 * - 3개 전체 통과: FULL SUCCESS
 * - 2개 통과 / 1개 기각: PARTIAL SUCCESS (2개만 반환, 1개 슬롯 교체 필요)
 * - 1개 이하 통과 또는 JSON 오류: FAIL (STAGE 0 재시작 필요)
 */
function validateStage7Output(stageOutput: string): Stage7ValidationResult {
    try {
        // JSON 배열 추출
        const jsonMatch = stageOutput.match(/\[\s*\{[\s\S]*?}\s*]/);

        if (!jsonMatch) {
            return {
                success: false,
                stockCount: 0,
                rejectedCount: 3,
                message: 'JSON 배열 추출 실패',
                shouldRetry: true,
                mode: 'fail',
            };
        }

        // JSON 파싱
        const parsed = JSON.parse(jsonMatch[0]);

        if (!Array.isArray(parsed)) {
            return {
                success: false,
                stockCount: 0,
                rejectedCount: 3,
                message: 'JSON 형식 오류: 배열이 아님',
                shouldRetry: true,
                mode: 'fail',
            };
        }

        const stockCount = parsed.length;
        const rejectedCount = Math.max(0, 3 - stockCount);

        // 3개 전체 통과 → FULL SUCCESS
        if (stockCount === 3) {
            return {
                success: true,
                stockCount: 3,
                rejectedCount: 0,
                message: '3개 종목 전체 통과',
                shouldRetry: false,
                mode: 'full',
            };
        }

        // 2개 통과 / 1개 기각 → PARTIAL SUCCESS
        if (stockCount === 2) {
            return {
                success: true,
                stockCount: 2,
                rejectedCount: 1,
                message: '2개 종목 통과, 1개 기각 (1개 슬롯 교체 필요)',
                shouldRetry: false,
                mode: 'partial',
            };
        }

        // 나머지 (0개 또는 1개, 혹은 3개 초과 등) → FAIL
        return {
            success: false,
            stockCount,
            rejectedCount,
            message: `통과 종목 수 부족: ${stockCount}개 (최소 2개 필요)`,
            shouldRetry: true,
            mode: 'fail',
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            stockCount: 0,
            rejectedCount: 3,
            message: `JSON 파싱 오류: ${errorMsg}`,
            shouldRetry: true,
            mode: 'fail',
        };
    }
}

/**
 * Stage 7 검증 결과 로깅
 */
function logStage7ValidationResult(result: Stage7ValidationResult): void {
    console.log(`\n${'━'.repeat(80)}`);

    if (result.mode === 'full') {
        console.log(`✅ STAGE 7 성공: 3개 종목 전체 최종 통과`);
        console.log(`${'━'.repeat(80)}`);
        console.log(`통과 종목: ${result.stockCount}개`);
        console.log(`1주일 10% 목표 달성 가능성: 검증 완료`);
        console.log(`판정: 실전 매매 적합 (FULL SUCCESS)`);
    } else if (result.mode === 'partial') {
        console.log(`🟡 STAGE 7 부분 성공: 2개 통과, 1개 기각`);
        console.log(`${'━'.repeat(80)}`);
        console.log(`통과 종목: ${result.stockCount}개`);
        console.log(`기각 종목: ${result.rejectedCount}개`);
        console.log(`조치: 통과 2개는 유지, 1개 슬롯은 상위 레이어에서 교체 탐색`);
        console.log(`판정: 실전 매매 부분 적합 (PARTIAL SUCCESS)`);
    } else {
        console.log(`❌ STAGE 7 기각: ${result.message}`);
        console.log(`${'━'.repeat(80)}`);
        console.log(`통과 종목: ${result.stockCount}개`);
        console.log(`기각 종목: ${result.rejectedCount}개`);
        console.log(`조치: STAGE 0부터 재시작 (새로운 200개 종목 수집)`);
        console.log(`사유: 최소 2개 통과 실패 → 포트폴리오 세트 신뢰 불가`);
    }

    console.log(`${'━'.repeat(80)}\n`);
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
 * Gemini 8-Stage Pipeline 실행
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
 *    ↓
 * STAGE 7: 상위 0.1% 트레이더 최종 컨펌
 *          - 3개 전체 통과: FULL SUCCESS (3개 반환)
 *          - 2개 통과 / 1개 기각: PARTIAL SUCCESS (2개 반환, 1개 슬롯 교체 필요)
 *          - 1개 이하 통과: FAILURE (STAGE 0 재시작)
 *
 * @returns JSON 문자열 (2~3개 종목 데이터, Stage 7 full/partial 성공 시에만 반환)
 * @throws {Error} Stage 7 fail 시 "STAGE_7_REJECTION" 에러 (Outer Layer에서 전체 재시도)
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

        if (stage.stageNumber === 7) {
            const validationResult = validateStage7Output(stageOutput);
            logStage7ValidationResult(validationResult);

            if (validationResult.mode === 'fail') {
                // 전체 세트 신뢰 불가 → STAGE 0부터 재시작을 위한 에러
                throw new Error(
                    `STAGE_7_REJECTION: ${validationResult.message}. STAGE 0부터 재수집 필요.`
                );
            }

            // FULL 또는 PARTIAL 성공 → 파이프라인 정상 종료
            console.log(`\n${'='.repeat(80)}`);
            if (validationResult.mode === 'full') {
                console.log(`🎉 Pipeline 완료: 3개 종목 최종 추천 (FULL SUCCESS)`);
            } else {
                console.log(
                    `🟡 Pipeline 부분 완료: 2개 종목 최종 추천 (PARTIAL SUCCESS, 1개 슬롯 교체 필요)`
                );
            }
            console.log(`${'='.repeat(80)}\n`);

            // stageOutput 안의 JSON 배열:
            // - full: 3개
            // - partial: 2개
            return stageOutput;
        }

        previousOutput = stageOutput;

        if (stage.stageNumber < 7) {
            console.log(
                `⏸️  다음 Stage 준비 중 (${PIPELINE_CONFIG.STAGE_DELAY / 1000}초 대기)...`
            );
            await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));
        }
    }

    throw new Error('Pipeline이 STAGE 7에 도달하지 못했습니다.');
}
