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

async function retry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

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

    const result = await retry(async () => {
      const response = await withTimeout(
        genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${SYSTEM_MESSAGE}\n\n${STOCK_ANALYSIS_PROMPT}` },
              ],
            },
          ],
          config: {
            tools: [{ googleSearch: {} }],
            maxOutputTokens: 8192,
            temperature: 0.3,
          },
        }),
        600000
      );
      return response.text || '';
    });

    if (!result) throw new Error('Empty response from Gemini');
    geminiBreaker.recordSuccess();
    return result;
  } catch (error) {
    geminiBreaker.recordFailure();
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Gemini Error]', msg);

    if (msg.includes('timeout')) {
      return '⚠️ Gemini 응답 시간 초과. 네트워크를 확인해주세요.';
    } else if (msg.includes('401') || msg.includes('API_KEY')) {
      return '⚠️ Gemini API 인증 오류. 관리자에게 문의하세요.';
    } else if (msg.includes('429') || msg.includes('quota')) {
      return '⚠️ Gemini API 사용량 한도 초과.';
    } else if (msg.includes('404') || msg.includes('not found')) {
      return '⚠️ Gemini 모델을 찾을 수 없습니다. 모델 이름을 확인해주세요.';
    }

    return `⚠️ Gemini 오류: ${msg}`;
  }
}