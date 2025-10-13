import OpenAI from 'openai';
import { CircuitBreaker } from './circuit-breaker';
import { STOCK_ANALYSIS_PROMPT } from '../prompts/stock-analysis-prompt';

const gptBreaker = new CircuitBreaker();

async function retry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export async function getGPTRecommendation(): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '⚠️ OpenAI API 키가 설정되지 않았습니다.';
  }

  if (gptBreaker.isOpen()) {
    console.warn('[GPT] Circuit breaker open');
    return '⚠️ GPT 서비스가 일시적으로 불안정합니다.';
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 600000,
      maxRetries: 2,
    });

    const result = await retry(async () => {
      const response = await openai.responses.create({
        model: 'gpt-4o',
        input: [{ role: 'user', content: STOCK_ANALYSIS_PROMPT }],
        max_output_tokens: 16000,
        tools: [{ type: 'web_search_preview' }],
      });

      if (response.status === 'incomplete') {
        if (response.incomplete_details?.reason === 'max_output_tokens') {
          console.warn('[GPT] Ran out of tokens during reasoning');
          return response.output_text || null;
        }
      }

      return response.output_text || null;
    });

    if (!result) throw new Error('Empty response from GPT');
    gptBreaker.recordSuccess();
    return result;
  } catch (error) {
    gptBreaker.recordFailure();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GPT Error]', msg);

    if (msg.includes('timeout')) {
      return '⚠️ GPT 응답 시간 초과. 네트워크를 확인해주세요.';
    } else if (msg.includes('401')) {
      return '⚠️ GPT API 인증 오류. 관리자에게 문의하세요.';
    } else if (msg.includes('429')) {
      return '⚠️ GPT API 사용량 한도 초과.';
    }

    return `⚠️ GPT 오류: ${msg}`;
  }
}