/**
 * 재사용 가능한 OpenAI 클라이언트 래퍼
 */

import OpenAI from 'openai';
import type { Response } from 'openai/resources/responses/responses';
import { OPENAI_API_CONFIG, PIPELINE_CONFIG } from '@/lib/llm/_config/pipeline-config';

interface GenerateTextOptions {
  prompt: string;
  config?: {
    maxOutputTokens?: number;
    responseMimeType?: string;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  };
  timeout?: number;
}

export function initializeOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // 호출부의 재시도와 타임아웃으로 요청 수명을 관리한다.
    maxRetries: 0,
    timeout: PIPELINE_CONFIG.STAGE_TIMEOUT,
  });
}

/**
 * OpenAI 응답별 실제 토큰 사용량과 검색 쿼리 수를 한 줄 JSON으로 기록
 */
export function logResponseUsage(stage: string, response: Response): void {
  const usage = response.usage;

  console.log(
    JSON.stringify({
      event: 'llm_usage',
      provider: 'openai',
      model: response.model,
      stage,
      promptTokenCount: usage?.input_tokens ?? null,
      candidatesTokenCount: usage?.output_tokens ?? null,
      thoughtsTokenCount: usage?.output_tokens_details?.reasoning_tokens ?? null,
      totalTokenCount: usage?.total_tokens ?? null,
      webSearchQueriesCount: response.output.filter((item) => item.type === 'web_search_call').length,
    })
  );
}

/**
 * 타임아웃.
 *
 * Promise.race만으로는 SDK 요청이 계속 돌아 과금된다(재시도까지 겹치면 동시에 세 건).
 * 호출부가 넘긴 AbortController를 함께 끊어 실제로 요청을 취소한다.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
  const {
    prompt,
    config = {},
    timeout = 120000,
  } = options;

  const client = initializeOpenAI();
  const controller = new AbortController();

  const response = await withTimeout(
    client.responses.create({
      model: OPENAI_API_CONFIG.MODEL,
      input: prompt,
      max_output_tokens: config.maxOutputTokens || OPENAI_API_CONFIG.MAX_OUTPUT_TOKENS,
      reasoning: { effort: config.reasoningEffort || OPENAI_API_CONFIG.REASONING_EFFORT },
      ...(config.responseMimeType === 'application/json' && {
        text: { format: { type: 'json_object' as const } },
      }),
    }, { signal: controller.signal }),
    timeout,
    controller,
  );

  logResponseUsage('generateText', response);
  if (response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens') {
    throw new Error('OpenAI 응답 잘림 (max_output_tokens)');
  }

  return response.output_text || '';
}
