import { FinishReason, GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import {
    createDateContext,
    getCommonPrinciples,
    STAGE_0_COLLECT_200,
    STAGE_1_FILTER_30,
    getStage2VerifyPrice,
    getStage3CollectIndicators,
    STAGE_4_CALCULATE_SCORES,
    getStage5JsonOutput,
    getStage6FinalVerification,
    getCrashAnalysisSearchPrompt,
    getCrashAnalysisJsonPrompt,
    getMarketAssessmentPrompt,
} from '../../prompts/korea';
import { PIPELINE_CONFIG, GEMINI_API_CONFIG } from '../_config/pipeline-config';
import { extractAndValidateJSON } from './stock-json';
import {
    evaluateMarketAssessmentSnapshot,
    formatMarketAssessmentSnapshot,
    getKisMarketAssessmentSnapshot,
    type MarketAssessmentEvidence,
    type MarketAssessmentSnapshot,
} from '@/lib/market-data/kis-market-assessment';

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
 * 경과 시간을 사람이 읽기 쉬운 형태로 포맷
 */
function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}

/**
 * API 호출 중 주기적으로 경과 시간 로그 출력
 */
function startProgressTimer(label: string, intervalMs = 10000): { stop: () => void } {
    const start = Date.now();
    const timer = setInterval(() => {
        const elapsed = Date.now() - start;
        console.log(`   ⏳ ${label} 진행 중... ${formatElapsed(elapsed)} 경과`);
    }, intervalMs);

    return {
        stop: () => {
            clearInterval(timer);
        },
    };
}

/**
 * Gemini 응답별 실제 토큰 사용량과 검색 쿼리 수를 한 줄 JSON으로 기록
 */
function logGenerateContentUsage(stage: string, response: GenerateContentResponse): void {
    const usage = response.usageMetadata;
    const webSearchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries;

    console.log(
        JSON.stringify({
            event: 'gemini_usage',
            stage,
            promptTokenCount: usage?.promptTokenCount ?? null,
            candidatesTokenCount: usage?.candidatesTokenCount ?? null,
            thoughtsTokenCount: usage?.thoughtsTokenCount ?? null,
            totalTokenCount: usage?.totalTokenCount ?? null,
            webSearchQueriesCount: webSearchQueries?.length ?? null,
        })
    );
}

/**
 * Promise에 타임아웃 적용
 *
 * onTimeout으로 진행 중인 API 요청을 abort하고, 완료 시 타이머를 정리해
 * 20분짜리 타이머가 프로세스 종료를 붙잡지 않도록 한다.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
            onTimeout?.();
            reject(new Error(`Timeout after ${ms}ms`));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Stage별 프롬프트 조립
 *
 * 프롬프트 모듈에서 직접 조립하므로 전체 프롬프트를 정규식으로 재분해하지 않는다
 * (헤더 문구 변경이 Stage 분리를 조용히 깨뜨리는 문제 방지).
 * 환각 방지를 위해 실행 시점의 DateContext가 각 Stage에 동적 주입된다.
 *
 * @param executionDate - 프롬프트 실행 시점 (기본값: 현재 시간)
 */
function buildStagePrompts(executionDate: Date = new Date()): StagePrompt[] {
    const context = createDateContext(executionDate);
    const commonPrinciples = getCommonPrinciples(context);

    const stageBodies = [
        { stageNumber: 0, stageName: '200개 종목 수집', body: STAGE_0_COLLECT_200 },
        { stageNumber: 1, stageName: '200개 → 30개 필터링', body: STAGE_1_FILTER_30 },
        { stageNumber: 2, stageName: '전일 종가 초정밀 검증', body: getStage2VerifyPrice(context) },
        { stageNumber: 3, stageName: '30개 지표 수집', body: getStage3CollectIndicators(context) },
        { stageNumber: 4, stageName: '7-카테고리 점수 산정', body: STAGE_4_CALCULATE_SCORES },
        { stageNumber: 5, stageName: '최종 JSON 출력', body: getStage5JsonOutput(context) },
        { stageNumber: 6, stageName: '사실관계 재검증 및 JSON 정제', body: getStage6FinalVerification(context) },
    ];

    const stages = stageBodies.map(({ stageNumber, stageName, body }) => ({
        stageNumber,
        stageName,
        prompt: `${commonPrinciples}\n\n${body}`,
        // STAGE 1부터 이전 결과 필요 (STAGE 1은 STAGE 0의 200개 리스트에서만 선별해야 함)
        requiresPreviousOutput: stageNumber >= 1,
    }));

    console.log(`📋 총 ${stages.length}개 Stage 조립 완료`);
    return stages;
}

/**
 * STAGE 6 산출물 게이트
 *
 * 형식 불량(JSON 추출 실패)은 저비용인 Stage 재시도로,
 * 사실 검증 실패는 고비용인 Pipeline 전체 재실행으로 라우팅하기 위해 에러를 구분한다.
 */
const STAGE_6_VERIFICATION_FAILED = 'STAGE_6_VERIFICATION_FAILED';

function validateStage6Output(text: string): string {
    // 실패 마커를 JSON 추출보다 먼저 검사 — 모델이 유효 JSON과 실패 마커를 함께 출력해도 실패가 우회되지 않도록 함
    if (text.includes(STAGE_6_VERIFICATION_FAILED)) {
        throw new Error(
            `${STAGE_6_VERIFICATION_FAILED}: 사실 검증 실패 종목 존재 — Pipeline 전체 재실행 필요`
        );
    }

    const validJSON = extractAndValidateJSON(text);
    if (validJSON) return validJSON;

    throw new Error('STAGE 6 출력에서 유효한 3개 종목 JSON을 추출하지 못했습니다');
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
    const stageStartTime = Date.now();
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🚀 [STAGE ${stage.stageNumber}/${6}] ${stage.stageName}`);
    console.log(`${'─'.repeat(60)}`);

    // 최대 5회 재시도 (Exponential Backoff)
    for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
        let apiStartTime = Date.now();
        let progress: { stop: () => void } | undefined;

        try {
            const finalPrompt =
                stage.requiresPreviousOutput && previousOutput
                    ? appendPreviousOutput(stage.prompt, previousOutput)
                    : stage.prompt;

            const promptChars = finalPrompt.length;
            const estimatedTokens = Math.round(promptChars / 4);
            console.log(`   📝 프롬프트: ${promptChars.toLocaleString()} chars (~${estimatedTokens.toLocaleString()} tokens)`);
            if (previousOutput) {
                console.log(`   📥 이전 Stage 결과 주입: ${previousOutput.length.toLocaleString()} chars`);
            }
            console.log(`   🤖 모델: ${GEMINI_API_CONFIG.MODEL} | 시도: ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY}`);
            console.log(`   ⏱️  타임아웃: ${formatElapsed(PIPELINE_CONFIG.STAGE_TIMEOUT)} | API 호출 시작...`);

            apiStartTime = Date.now();
            progress = startProgressTimer(`STAGE ${stage.stageNumber}`, 15000);
            const abortController = new AbortController();

            const response = await withTimeout(
                genAI.models.generateContent({
                    model: GEMINI_API_CONFIG.MODEL,
                    contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
                    config: {
                        abortSignal: abortController.signal,
                        tools: [{ googleSearch: {} }],
                        maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
                        temperature: GEMINI_API_CONFIG.TEMPERATURE,
                        topP: GEMINI_API_CONFIG.TOP_P,
                        topK: GEMINI_API_CONFIG.TOP_K,
                        responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
                    },
                }),
                PIPELINE_CONFIG.STAGE_TIMEOUT,
                () => abortController.abort()
            );

            progress.stop();
            const apiElapsed = Date.now() - apiStartTime;
            logGenerateContentUsage(`STAGE ${stage.stageNumber}`, response);
            const text = response.text ?? '';
            console.log(`   ✅ API 응답 수신: ${text.length.toLocaleString()} chars (${formatElapsed(apiElapsed)})`);

            const finishReason = response.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== FinishReason.STOP) {
                throw new Error(
                    `STAGE ${stage.stageNumber} 응답 비정상 종료 (finishReason: ${finishReason}) — 출력 잘림/차단 가능성`
                );
            }
            if (text.trim().length < PIPELINE_CONFIG.MIN_STAGE_OUTPUT_CHARS) {
                throw new Error(
                    `STAGE ${stage.stageNumber} 응답이 비정상적으로 짧습니다 (${text.trim().length} chars)`
                );
            }

            const output = stage.stageNumber === 6 ? validateStage6Output(text) : text;
            console.log(`   📊 Stage ${stage.stageNumber} 총 소요: ${formatElapsed(Date.now() - stageStartTime)}`);
            return output;
        } catch (error) {
            progress?.stop();
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            const apiElapsed = Date.now() - apiStartTime;

            console.error(`\n${'━'.repeat(80)}`);
            console.error(
                `❌ [STAGE ${stage.stageNumber} 실패] 시도 ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY} (${formatElapsed(apiElapsed)} 경과)`
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

            // 재시도로 해결되지 않는 오류는 즉시 중단 (인증 오류, STAGE 6 사실 검증 실패)
            if (isAuth || errorMsg.includes(STAGE_6_VERIFICATION_FAILED)) {
                throw error;
            }

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

    const pipelineStartTime = Date.now();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🎯 Gemini Multi-Stage Pipeline 시작`);
    console.log(`${'='.repeat(80)}`);
    console.log(`   📌 Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
    console.log(`   📌 Location: ${PIPELINE_CONFIG.VERTEX_AI_LOCATION}`);
    console.log(`   📌 Model: ${GEMINI_API_CONFIG.MODEL}`);
    console.log(`   📌 Max Output Tokens: ${GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS.toLocaleString()}`);
    console.log(`   📌 Temperature: ${GEMINI_API_CONFIG.TEMPERATURE} | TopP: ${GEMINI_API_CONFIG.TOP_P} | TopK: ${GEMINI_API_CONFIG.TOP_K}`);
    console.log(`   📌 Stage 타임아웃: ${formatElapsed(PIPELINE_CONFIG.STAGE_TIMEOUT)} | Stage 간 쿨다운: ${formatElapsed(PIPELINE_CONFIG.STAGE_DELAY)}`);
    console.log(`   📌 재시도: Outer ${PIPELINE_CONFIG.OUTER_MAX_RETRY}회 × Stage ${PIPELINE_CONFIG.STAGE_MAX_RETRY}회`);
    console.log(`${'='.repeat(80)}`);

    const genAI = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
    });

    const stages = buildStagePrompts();
    let previousOutput: string | undefined;

    for (const stage of stages) {
        const stageOutput = await executeStage(genAI, stage, previousOutput);

        // Stage 6에서 파이프라인 종료
        if (stage.stageNumber === 6) {
            const totalElapsed = Date.now() - pipelineStartTime;
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🎉 Pipeline 완료: 3개 종목 최종 추천`);
            console.log(`   ⏱️  총 소요 시간: ${formatElapsed(totalElapsed)}`);
            console.log(`${'='.repeat(80)}\n`);
            return stageOutput;
        }

        previousOutput = stageOutput;

        if (stage.stageNumber < 6) {
            const elapsed = Date.now() - pipelineStartTime;
            console.log(
                `⏸️  다음 Stage 준비 중 (${PIPELINE_CONFIG.STAGE_DELAY / 1000}초 대기)... [총 경과: ${formatElapsed(elapsed)}]`
            );
            await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));
        }
    }

    throw new Error('Pipeline이 STAGE 6에 도달하지 못했습니다.');
}

/**
 * 시장 평가 결과 타입
 */
export interface MarketAssessment {
    verdict: 'NORMAL' | 'CRASH_ALERT';
    confidence: number;
    summary: string;
}

function parseMarketAssessmentResponse(text: string): MarketAssessment {
    const candidate = text.trim();
    const jsonBlock = candidate.match(/\{[\s\S]*\}/)?.[0] ?? candidate;
    const parsed = JSON.parse(jsonBlock) as Partial<MarketAssessment>;

    if (parsed.verdict !== 'NORMAL' && parsed.verdict !== 'CRASH_ALERT') {
        throw new Error('시장 평가 응답 verdict가 유효하지 않습니다.');
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
        throw new Error('시장 평가 응답 confidence가 유효하지 않습니다.');
    }

    if (typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
        throw new Error('시장 평가 응답 summary가 비어 있습니다.');
    }

    return {
        verdict: parsed.verdict,
        confidence: Math.round(parsed.confidence),
        summary: parsed.summary.trim(),
    };
}

async function executeSearchMarketAssessmentFallback(snapshotError: string): Promise<MarketAssessment> {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
        throw new Error(`시장 스냅샷 확보 실패 후 fallback 불가: ${snapshotError}`);
    }

    console.warn(`⚠️ 시장 스냅샷 확보 실패. Gemini search fallback 진입: ${snapshotError}`);

    const genAI = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
    });

    const prompt = getMarketAssessmentPrompt({
        executionDate: new Date(),
        snapshot: null,
        evidence: null,
    });

    for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
        try {
            const abortController = new AbortController();
            const response = await withTimeout(
                genAI.models.generateContent({
                    model: GEMINI_API_CONFIG.MODEL,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        abortSignal: abortController.signal,
                        tools: [{ googleSearch: {} }],
                        maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
                        temperature: GEMINI_API_CONFIG.TEMPERATURE,
                        topP: GEMINI_API_CONFIG.TOP_P,
                        topK: GEMINI_API_CONFIG.TOP_K,
                        // googleSearch 도구와 JSON 모드는 함께 쓸 수 없음 — 텍스트에서 JSON 추출
                        responseMimeType: GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
                    },
                }),
                PIPELINE_CONFIG.STAGE_TIMEOUT,
                () => abortController.abort()
            );

            logGenerateContentUsage('MARKET ASSESSMENT FALLBACK', response);
            const parsed = parseMarketAssessmentResponse(response.text || '');
            const resolved =
                parsed.verdict === 'CRASH_ALERT' && parsed.confidence < 70
                    ? {
                        verdict: 'NORMAL' as const,
                        confidence: 69,
                        summary: `Gemini search fallback에서 낮은 신뢰 crash 신호가 감지됐지만 confidence 기준 미달로 NORMAL 처리했습니다. ${parsed.summary}`,
                    }
                    : parsed;

            console.log(`✅ 시장 평가 완료 (Gemini fallback): ${resolved.verdict} (confidence: ${resolved.confidence})`);
            console.log(`   요약: ${resolved.summary}`);
            return resolved;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️ 시장 평가 fallback 시도 ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY} 실패: ${errorMsg}`);

            if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) {
                throw new Error(`시장 스냅샷 확보 실패 후 Gemini fallback도 실패: ${errorMsg}`);
            }

            const delay = PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw new Error(`시장 스냅샷 확보 실패 후 Gemini fallback도 실패: ${snapshotError}`);
}

function resolveMarketAssessmentFromSnapshot(
    snapshot: MarketAssessmentSnapshot,
    evidence: MarketAssessmentEvidence
): MarketAssessment {
    const { sp500, dowJones, nasdaqComposite, kospi200MiniFutures, vix, usdKrw, usdJpy } = snapshot.indicators;
    const tier1Count = evidence.tier1Signals.length;
    const tier3Count = evidence.tier3Signals.length;
    const supportingSummary = evidence.supportingNotes.slice(0, 3).join(' / ');
    const formatSupplementaryIndicator = (label: string, indicator: typeof vix | typeof usdKrw | typeof usdJpy, unit: string) =>
        indicator
            ? `${label} ${indicator.change.toFixed(2)}${unit}${indicator.validation === 'cross_checked' ? ' [cross-checked]' : indicator.validation === 'single_source' ? ' [single-source]' : ''}`
            : null;

    const effectiveKospi = snapshot.nightSession.kospiMiniFutures ?? kospi200MiniFutures;
    const kospiLabel = snapshot.nightSession.kospiMiniFutures ? 'KOSPI200 mini futures (night)' : 'KOSPI200 mini futures';

    const numericContext = [
        `S&P 500 ${sp500.changePct.toFixed(2)}%`,
        dowJones ? `Dow ${dowJones.changePct.toFixed(2)}%` : 'Dow unavailable [KIS 서빙 중단]',
        `NASDAQ Composite ${nasdaqComposite.changePct.toFixed(2)}%`,
        `${kospiLabel} ${effectiveKospi.changePct.toFixed(2)}%`,
        evidence.kospiDataStale ? `[KOSPI 주간장 ${kospi200MiniFutures.changePct.toFixed(2)}% stale — 글로벌 반등 불일치로 제외]` : null,
        vix ? `VIX ${vix.price.toFixed(2)} (${vix.change.toFixed(2)}pt)${vix.validation === 'cross_checked' ? ' [cross-checked]' : vix.validation === 'single_source' ? ' [single-source]' : ''}` : null,
        formatSupplementaryIndicator('USD/KRW', usdKrw, ' KRW'),
        formatSupplementaryIndicator('USD/JPY', usdJpy, ' JPY'),
    ].filter(Boolean).join(', ');

    const scoreContext = `[SCORE: ${evidence.crashScore}/100] [COHERENCE: ${evidence.directionCoherence}] [VIX_REGIME: ${evidence.vixRegime}]`;

    if (evidence.crashScore >= 55 && evidence.confidence >= 70) {
        return {
            verdict: 'CRASH_ALERT',
            confidence: evidence.confidence,
            summary: `${scoreContext} crashScore ${evidence.crashScore} ≥ 55. ${tier1Count > 0 ? `Tier 1: ${evidence.tier1Signals.join(', ')}. ` : ''}${tier3Count > 0 ? `이벤트: ${evidence.tier3Signals.join(', ')}. ` : ''}${numericContext}.${supportingSummary ? ` 보강: ${supportingSummary}.` : ''}`,
        };
    }

    return {
        verdict: 'NORMAL',
        confidence: evidence.confidence,
        summary: `${scoreContext} ${evidence.crashScore >= 55 ? `crashScore ${evidence.crashScore} ≥ 55이나 confidence ${evidence.confidence} < 70으로 NORMAL 다운그레이드. ` : `crashScore ${evidence.crashScore} < 55. `}${numericContext}.${evidence.kospiDataStale ? ` ${evidence.stalenessNote}.` : ''}${supportingSummary ? ` 보강: ${supportingSummary}.` : ''}${tier3Count > 0 ? ` 이벤트 참고: ${evidence.tier3Signals.join(', ')}.` : ''}`,
    };
}

/**
 * 시장 대폭락 가능성 평가
 *
 * 06:00 KST 시점에서 글로벌 시장 데이터를 기반으로
 * 한국 시장 대폭락 가능성을 판정합니다.
 *
 * @returns MarketAssessment (verdict, confidence, summary)
 */
export async function executeMarketAssessment(): Promise<MarketAssessment> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 시장 평가 (Market Assessment) 시작`);
    console.log(`${'='.repeat(80)}`);

    try {
        const snapshot = await getKisMarketAssessmentSnapshot();
        const evidence = evaluateMarketAssessmentSnapshot(snapshot);
        console.log('📡 시장 스냅샷 확보 완료');
        console.log(formatMarketAssessmentSnapshot(snapshot));
        if (evidence.tier1Signals.length > 0) {
            console.log(`🚨 로컬 Tier 1 신호: ${evidence.tier1Signals.join(', ')}`);
        }
        if (evidence.tier2Signals.length > 0) {
            console.log(`⚠️ 로컬 Tier 2 신호: ${evidence.tier2Signals.join(', ')}`);
        }

        const resolved = resolveMarketAssessmentFromSnapshot(snapshot, evidence);
        console.log(`✅ 시장 평가 완료 (API local): ${resolved.verdict} (confidence: ${resolved.confidence})`);
        console.log(`   요약: ${resolved.summary}`);
        return resolved;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return executeSearchMarketAssessmentFallback(errorMsg);
    }
}

/**
 * 폭락 분석 2-Stage Pipeline 실행
 *
 * Stage 1: Google Search로 원인 심층 분석
 * Stage 2: 분석 결과를 구조화된 JSON으로 변환
 *
 * @param assessmentSummary - 시장 평가 요약 (context 전달용)
 * @returns crash_alert JSON 문자열
 */
export async function executeCrashAnalysisPipeline(assessmentSummary: string): Promise<string> {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
        throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.');
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚨 폭락 분석 Pipeline 시작`);
    console.log(`${'='.repeat(80)}`);

    const genAI = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT,
        location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
    });

    // Stage 1: 심층 분석 (Google Search)
    console.log('\n🔍 [폭락 분석 Stage 1] 원인 심층 분석...');
    const searchPrompt = getCrashAnalysisSearchPrompt(assessmentSummary);

    let searchResult = '';
    for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
        try {
            const abortController = new AbortController();
            const response = await withTimeout(
                genAI.models.generateContent({
                    model: GEMINI_API_CONFIG.MODEL,
                    contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
                    config: {
                        abortSignal: abortController.signal,
                        tools: [{ googleSearch: {} }],
                        maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
                        temperature: GEMINI_API_CONFIG.TEMPERATURE,
                        topP: GEMINI_API_CONFIG.TOP_P,
                        topK: GEMINI_API_CONFIG.TOP_K,
                        responseMimeType: 'text/plain',
                    },
                }),
                PIPELINE_CONFIG.STAGE_TIMEOUT,
                () => abortController.abort()
            );

            logGenerateContentUsage('CRASH ANALYSIS STAGE 1', response);
            searchResult = response.text || '';
            if (searchResult.trim().length < PIPELINE_CONFIG.MIN_STAGE_OUTPUT_CHARS) {
                throw new Error(
                    `폭락 분석 Stage 1 응답이 비정상적으로 짧습니다 (${searchResult.trim().length} chars)`
                );
            }
            console.log(`✅ Stage 1 완료 (${searchResult.length} chars)`);
            break;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️ Stage 1 시도 ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY} 실패: ${errorMsg}`);

            if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) throw error;

            const delay = PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    // Stage 간 쿨다운
    await new Promise((resolve) => setTimeout(resolve, PIPELINE_CONFIG.STAGE_DELAY));

    // Stage 2: JSON 구조화
    console.log('\n📋 [폭락 분석 Stage 2] JSON 구조화...');
    const jsonPrompt = getCrashAnalysisJsonPrompt(searchResult);

    for (let attempt = 1; attempt <= PIPELINE_CONFIG.STAGE_MAX_RETRY; attempt++) {
        try {
            const abortController = new AbortController();
            const response = await withTimeout(
                genAI.models.generateContent({
                    model: GEMINI_API_CONFIG.MODEL,
                    contents: [{ role: 'user', parts: [{ text: jsonPrompt }] }],
                    config: {
                        abortSignal: abortController.signal,
                        maxOutputTokens: GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
                        temperature: GEMINI_API_CONFIG.TEMPERATURE,
                        topP: GEMINI_API_CONFIG.TOP_P,
                        topK: GEMINI_API_CONFIG.TOP_K,
                        responseMimeType: 'application/json',
                    },
                }),
                PIPELINE_CONFIG.STAGE_TIMEOUT,
                () => abortController.abort()
            );

            logGenerateContentUsage('CRASH ANALYSIS STAGE 2', response);
            const text = response.text || '';
            if (text.trim().length < PIPELINE_CONFIG.MIN_STAGE_OUTPUT_CHARS) {
                throw new Error(
                    `폭락 분석 Stage 2 응답이 비정상적으로 짧습니다 (${text.trim().length} chars)`
                );
            }
            console.log(`✅ Stage 2 완료 (${text.length} chars)`);

            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚨 폭락 분석 Pipeline 완료`);
            console.log(`${'='.repeat(80)}\n`);

            return text;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️ Stage 2 시도 ${attempt}/${PIPELINE_CONFIG.STAGE_MAX_RETRY} 실패: ${errorMsg}`);

            if (attempt === PIPELINE_CONFIG.STAGE_MAX_RETRY) throw error;

            const delay = PIPELINE_CONFIG.STAGE_INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw new Error('폭락 분석 Pipeline Stage 2 실행 실패');
}
