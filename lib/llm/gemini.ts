import { GoogleGenAI } from '@google/genai';
import { CircuitBreaker } from './circuit-breaker';
import { STOCK_ANALYSIS_PROMPT } from '../prompts/stock-analysis-prompt';

const geminiBreaker = new CircuitBreaker();
const MAX_RETRY = 10; // 5 → 10으로 증가
const BASE_RETRY_DELAY = 2000; // 기본 지연 시간 (Exponential Backoff 용)
const API_TIMEOUT = 900000; // 15분

// 글로벌 엔드포인트로 429 에러 완화
const VERTEX_AI_LOCATION = 'us-central1'; // 리전 엔드포인트 (안정성 우선)

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
 * JSON 문자열에서 제어 문자 제거
 * @param str - 원본 문자열
 * @returns 제어 문자가 제거된 문자열
 */
function removeControlCharacters(str: string): string {
  // ASCII 제어 문자 (0x00-0x1F) 제거, 단 \n, \r, \t는 유지
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
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
      console.warn('[JSON 추출] JSON 배열 구조를 찾을 수 없음');
      return null;
    }

    // JSON 부분 추출
    let jsonStr = trimmed.substring(startIdx, endIdx + 1);

    // 제어 문자 제거
    jsonStr = removeControlCharacters(jsonStr);

    const parsed = JSON.parse(jsonStr);

    // 데이터 구조 검증
    if (validateStockData(parsed)) {
      return jsonStr;
    }

    console.warn('[JSON 검증] 데이터 구조 검증 실패');
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[JSON 파싱 에러] ${errorMsg}`);

    // 디버깅을 위해 문제가 되는 부분 출력 (앞뒤 100자)
    try {
      const trimmed = text.trim();
      const startIdx = trimmed.indexOf('[');
      if (startIdx !== -1) {
        const jsonStr = trimmed.substring(startIdx);
        const problemArea = jsonStr.substring(Math.max(0, 452 - 50), Math.min(jsonStr.length, 452 + 50));
        console.error(`[문제 영역] position 452 주변:\n${problemArea}`);
      }
    } catch {
      // 디버깅 출력 실패 시 무시
    }

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
  console.log('[API 호출 시작] generateContent 요청 중...');

  let response;
  try {
    response = await withTimeout(
      genAI.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: [
          {
            role: 'user',
            parts: [{ text: STOCK_ANALYSIS_PROMPT }],
          },
        ],
        config: {
          tools: [{ googleSearch: {} }],  // 실시간 주식 데이터 검색
          maxOutputTokens: 32768,          // 최대 출력 토큰
          temperature: 0.1,                // 최고 정확성 (거의 결정론적)
          topP: 0.7,                       // 보수적 설정 (정확성 우선)
          topK: 30,                        // 제한적 토큰 선택 (정확성 우선)
          responseMimeType: 'text/plain',  // JSON 문자열 반환
          thinkingConfig: {
            thinkingBudget: 27000,         // 깊은 사고 과정
          },
        },
      }),
      API_TIMEOUT
    );
    console.log('[API 호출 성공] 응답 수신 완료');
  } catch (error) {
    console.error('[API 호출 실패]', error);
    throw error;
  }

  // 응답 타입 확인 (디버깅용)
  console.log(`[Response Type] typeof response: ${typeof response}`);
  console.log(`[Response Keys] ${Object.keys(response || {}).join(', ')}`);

  // response.text 접근 시도
  try {
    const text = response.text;
    console.log(`[Response Text Type] typeof response.text: ${typeof text}`);
    console.log(`[Response Text Length] ${text ? String(text).length : 0}`);

    if (text && typeof text === 'string') {
      return text;
    }

    // text가 객체인 경우 (Gemini 응답이 객체일 수 있음)
    if (text && typeof text === 'object') {
      return JSON.stringify(text);
    }
  } catch (error) {
    console.error(`[Response Text Access Error] ${error}`);
  }

  // 전체 response를 JSON으로 반환 (최후의 수단)
  console.warn('[Warning] response.text 접근 실패, 전체 response 반환');
  return JSON.stringify(response);
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
 * Gemini 주식 추천 분석 실행 (Vertex AI)
 */
export async function getGeminiRecommendation(): Promise<string> {
  // 환경 변수 검증
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    return '⚠️ GOOGLE_CLOUD_PROJECT 환경 변수가 설정되지 않았습니다.';
  }

  console.log(`[Gemini] Using Vertex AI (Project: ${process.env.GOOGLE_CLOUD_PROJECT})`);

  if (geminiBreaker.isOpen()) {
    console.warn('[Gemini] Circuit breaker open');
    return '⚠️ Gemini 서비스가 일시적으로 불안정합니다.';
  }

  try {
    // GoogleGenAI 초기화 (Vertex AI)
    console.log(`[Gemini] Vertex AI Location: ${VERTEX_AI_LOCATION}`);

    const genAI = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: VERTEX_AI_LOCATION,
    });

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      // Exponential Backoff: 2초 → 4초 → 8초 → 16초 (최대 32초)
      const retryDelay = Math.min(BASE_RETRY_DELAY * Math.pow(2, attempt - 1), 32000);

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
          console.log(`🔄 [Gemini] ${retryDelay / 1000}초 후 재시도... (Exponential Backoff)`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        const is429Error = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED');

        console.warn(`⚠️ [Gemini] API 오류 (${attempt}/${MAX_RETRY}): ${errorMsg}`);

        if (is429Error) {
          console.log(`🔍 [429 Error] Quota 초과 감지 - Exponential Backoff 적용`);
        }

        if (attempt < MAX_RETRY) {
          console.log(`🔄 [Gemini] ${retryDelay / 1000}초 후 재시도... (Exponential Backoff)`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
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