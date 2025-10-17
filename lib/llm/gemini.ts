import { GoogleGenAI } from '@google/genai';
import { CircuitBreaker } from './circuit-breaker';
import { STOCK_ANALYSIS_PROMPT } from '../prompts/stock-analysis-prompt';

const geminiBreaker = new CircuitBreaker();
const MAX_RETRY = 5;
const RETRY_DELAY = 2000;
const API_TIMEOUT = 600000; // 10분

/**
 * Promise에 타임아웃 적용
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms)
    ),
  ]);
}

/**
 * 응답에서 유효한 JSON 배열 추출 및 검증
 * @param text - 전체 응답 텍스트
 * @returns 유효한 JSON 문자열 또는 null
 */
function extractAndValidateJSON(text: string): string | null {
  try {
    const trimmed = text.trim();

    // JSON 배열의 시작과 끝 위치 찾기
    const startIdx = trimmed.indexOf('[');
    const endIdx = trimmed.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      return null;
    }

    // JSON 부분 추출
    const jsonStr = trimmed.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);

    // 데이터 구조 검증
    if (validateStockData(parsed)) {
      return jsonStr;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 주식 데이터 구조 검증
 */
function validateStockData(data: unknown): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.every((item) => {
    if (!item || typeof item !== 'object') return false;

    const { ticker, name, close_price, rationale, signals } = item;

    // 필수 필드 존재 확인
    if (!ticker || !name || !close_price || !rationale || !signals) {
      return false;
    }

    // signals 하위 필드 확인
    const { trend_score, momentum_score, volume_score, volatility_score, overall_score } = signals;
    return (
        typeof trend_score === 'number' &&
        typeof momentum_score === 'number' &&
        typeof volume_score === 'number' &&
        typeof volatility_score === 'number' &&
        typeof overall_score === 'number'
    );
  });
}

/**
 * Gemini API 호출 (최적화된 설정)
 */
async function callGeminiAPI(genAI: GoogleGenAI): Promise<string> {
  const response = await withTimeout(
    genAI.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          role: 'user',
          parts: [{ text: STOCK_ANALYSIS_PROMPT }],
        },
      ],
        config: {
            tools: [{ googleSearch: {} }],
            maxOutputTokens: 32768,
            temperature: 0.5,
            topP: 0.95,
            topK: 40,
            responseMimeType: 'text/plain',
            thinkingConfig: {
                thinkingBudget: 22000,
            },
        },
    }),
    API_TIMEOUT
  );

  return response.text || '';
}

/**
 * 에러 메시지 포맷팅
 */
function formatErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes('timeout')) return '⚠️ Gemini 응답 시간 초과. 네트워크를 확인해주세요.';
  if (msg.includes('401') || msg.includes('API_KEY')) return '⚠️ Gemini API 인증 오류. 관리자에게 문의하세요.';
  if (msg.includes('429') || msg.includes('quota')) return '⚠️ Gemini API 사용량 한도 초과.';
  if (msg.includes('404') || msg.includes('not found')) return '⚠️ Gemini 모델을 찾을 수 없습니다. 모델 이름을 확인해주세요.';
  if (msg.includes('JSON 검증 실패')) return '⚠️ Gemini가 올바른 형식의 응답을 생성하지 못했습니다.';

  return `⚠️ Gemini 오류: ${msg}`;
}

/**
 * Gemini 주식 추천 분석 실행
 */
export async function getGeminiRecommendation(): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return '⚠️ Gemini API 키가 설정되지 않았습니다.';
  }

  if (geminiBreaker.isOpen()) {
    console.warn('[Gemini] Circuit breaker open');
    return '⚠️ Gemini 서비스가 일시적으로 불안정합니다.';
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      console.log(`[Gemini] 시도 ${attempt}/${MAX_RETRY}`);

      try {
        const result = await callGeminiAPI(genAI);

        if (!result) {
          throw new Error('Empty response from Gemini');
        }

        // 응답 로깅
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📥 [Gemini 원본 응답] (${attempt}/${MAX_RETRY})`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(result);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        // JSON 추출 및 검증
        const validJSON = extractAndValidateJSON(result);

        if (validJSON) {
          console.log(`✅ [Gemini] 유효한 JSON 응답 받음 (${attempt}/${MAX_RETRY})`);
          if (validJSON !== result) {
            console.log(`📦 [추출된 JSON]:\n${validJSON}\n`);
          }
          geminiBreaker.recordSuccess();
          return validJSON;
        }

        // 재시도 처리
        console.warn(`⚠️ [Gemini] JSON 검증 실패 (${attempt}/${MAX_RETRY})`);

        if (attempt < MAX_RETRY) {
          console.log(`🔄 [Gemini] ${RETRY_DELAY / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }

      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        console.warn(`⚠️ [Gemini] API 오류 (${attempt}/${MAX_RETRY}): ${errorMsg}`);

        if (attempt < MAX_RETRY) {
          console.log(`🔄 [Gemini] ${RETRY_DELAY / 1000}초 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        } else {
          throw apiError;
        }
      }
    }

    throw new Error(`JSON 검증 실패: ${MAX_RETRY}번 시도 후에도 올바른 응답을 받지 못했습니다.`);

  } catch (error) {
    geminiBreaker.recordFailure();
    console.error('❌ [Gemini Error]', error);
    return formatErrorMessage(error);
  }
}