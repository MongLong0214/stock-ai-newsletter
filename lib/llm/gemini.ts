import { GoogleGenAI } from '@google/genai';
import { CircuitBreaker } from './circuit-breaker';
import { STOCK_ANALYSIS_PROMPT, SYSTEM_MESSAGE } from '../prompts/stock-analysis-prompt';

const geminiBreaker = new CircuitBreaker();

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), ms)
    ),
  ]);
}

/**
 * JSON 유효성 검증 함수
 * @param text - 검증할 텍스트
 * @returns JSON 배열이면 true, 아니면 false
 */
function isValidJSON(text: string): boolean {
  try {
    const trimmed = text.trim();
    // JSON 배열 형식인지 확인
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
      return false;
    }

    // 실제 파싱 테스트
    const parsed = JSON.parse(trimmed);

    // 배열이고, 최소 1개 이상의 요소가 있는지 확인
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return false;
    }

    // 각 요소가 필수 필드를 가지고 있는지 확인
    for (const item of parsed) {
      if (!item.ticker || !item.name || !item.close_price || !item.rationale || !item.levels) {
        return false;
      }
      if (!item.levels.entry1 || !item.levels.entry2 || !item.levels.entry3 ||
          !item.levels.sl1 || !item.levels.sl2 || !item.levels.sl3) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Gemini API 호출 후 응답 처리
 */
async function callGeminiAPI(genAI: GoogleGenAI): Promise<string> {
  const response = await withTimeout(
    genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_MESSAGE}\n\n${STOCK_ANALYSIS_PROMPT}` }],
        },
      ],
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8192,
        temperature: 0.3,
      },
    }),
    600000 // 10분
  );

  return response.text || '';
}

/**
 * 재시도 가능 여부 확인 및 대기
 */
async function handleRetry(attempt: number, maxRetries: number, delay: number): Promise<boolean> {
  if (attempt >= maxRetries) {
    return false; // 재시도 불가
  }

  console.log(`🔄 [Gemini] ${delay / 1000}초 후 재시도...`);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return true; // 재시도 가능
}

/**
 * 에러 메시지를 사용자 친화적 메시지로 변환
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

export async function getGeminiRecommendation(): Promise<string> {
  // 사전 검증
  if (!process.env.GEMINI_API_KEY) {
    return '⚠️ Gemini API 키가 설정되지 않았습니다.';
  }

  if (geminiBreaker.isOpen()) {
    console.warn('[Gemini] Circuit breaker open');
    return '⚠️ Gemini 서비스가 일시적으로 불안정합니다.';
  }

  const MAX_RETRY = 5;
  const RETRY_DELAY = 2000;

  try {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 재시도 루프
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      console.log(`[Gemini] 시도 ${attempt}/${MAX_RETRY}`);

      try {
        const result = await callGeminiAPI(genAI);

        // 빈 응답 처리
        if (!result) {
          throw new Error('Empty response from Gemini');
        }

        // 응답값 전체 로깅
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📥 [Gemini 응답] (${attempt}/${MAX_RETRY})`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(result);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        // JSON 검증
        if (!isValidJSON(result)) {
          console.warn(`⚠️ [Gemini] 비-JSON 응답 감지 (${attempt}/${MAX_RETRY})`);

          const canRetry = await handleRetry(attempt, MAX_RETRY, RETRY_DELAY);
          if (!canRetry) {
            throw new Error(`JSON 검증 실패: ${MAX_RETRY}번 시도 후에도 올바른 응답을 받지 못했습니다.`);
          }
          continue;
        }

        // 성공
        console.log(`✅ [Gemini] 유효한 JSON 응답 받음 (${attempt}/${MAX_RETRY})`);
        geminiBreaker.recordSuccess();
        return result;

      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        console.warn(`⚠️ [Gemini] API 오류 (${attempt}/${MAX_RETRY}): ${errorMsg}`);

        const canRetry = await handleRetry(attempt, MAX_RETRY, RETRY_DELAY);
        if (!canRetry) {
          throw apiError;
        }
      }
    }

    throw new Error('재시도 로직 오류');
  } catch (error) {
    geminiBreaker.recordFailure();
    console.error('❌ [Gemini Error]', error);
    return formatErrorMessage(error);
  }
}