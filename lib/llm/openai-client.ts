/**
 * 재사용 가능한 OpenAI 클라이언트 래퍼
 */

import OpenAI, { type ClientOptions } from 'openai';
import type { Response } from 'openai/resources/responses/responses';
import { Agent, fetch as undiciFetch } from 'undici';
import { OPENAI_API_CONFIG, PIPELINE_CONFIG } from '@/lib/llm/_config/pipeline-config';

interface GenerateTextOptions {
  prompt: string;
  /** 함께 보낼 이미지 1장 (비전 검수용) */
  image?: { data: Buffer; mimeType: string };
  config?: {
    maxOutputTokens?: number;
    responseMimeType?: string;
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  };
  timeout?: number;
}

/**
 * Node 내장 fetch(undici)는 headersTimeout 기본값이 300초라, 응답 헤더를 완료 후에야 보내는
 * 비스트리밍 Responses 호출은 STAGE_TIMEOUT과 무관하게 5분에서 끊긴다(2026-11-03 CRASH_ALERT 실패).
 * SDK timeout과 같은 헤더/바디 타임아웃의 dispatcher로 요청 수명을 호출부 타임아웃에 맡긴다.
 */
const openAIDispatcher = new Agent({
  headersTimeout: PIPELINE_CONFIG.STAGE_TIMEOUT,
  bodyTimeout: PIPELINE_CONFIG.STAGE_TIMEOUT,
});

// WHY: Node 20 워크플로(블로그)의 내장 fetch는 undici 6이라 npm undici 7 Agent를 받지 못한다 → fetch도 같은 undici로 고정.
// undici Request/Response 타입은 DOM 타입과 구조만 미세하게 달라 SDK Fetch 시그니처로 맞춘다.
const openAIFetch = undiciFetch as unknown as NonNullable<ClientOptions['fetch']>;

export function initializeOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // 호출부의 재시도와 타임아웃으로 요청 수명을 관리한다.
    maxRetries: 0,
    timeout: PIPELINE_CONFIG.STAGE_TIMEOUT,
    fetch: openAIFetch,
    fetchOptions: { dispatcher: openAIDispatcher },
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
    image,
    config = {},
    timeout = 120000,
  } = options;

  const client = initializeOpenAI();
  const controller = new AbortController();

  const response = await withTimeout(
    client.responses.create({
      model: OPENAI_API_CONFIG.MODEL,
      input: image
        ? [{
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: prompt },
            { type: 'input_image' as const, image_url: `data:${image.mimeType};base64,${image.data.toString('base64')}`, detail: 'high' as const },
          ],
        }]
        : prompt,
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

interface GenerateImageOptions {
  prompt: string;
  model: string;
  size: `${number}x${number}`;
  quality: 'low' | 'medium' | 'high';
  timeout: number;
  /** 기본 webp. 글자 합성(satori)이 webp를 못 읽어 커버는 jpeg로 받는다 */
  format?: 'webp' | 'jpeg';
}

/**
 * 이미지 1장 생성 → WebP(기본) 또는 JPEG 바이트.
 *
 * 텍스트와 같은 이유로 타임아웃 시 요청을 실제로 끊는다(과금 방지). 재시도와 모델 폴백은
 * 호출부가 정한다 — 같은 프롬프트를 여기서 다시 보내면 실패 원인(권한·정책)과 무관하게
 * 비용만 두 배가 된다.
 */
export async function generateImage(options: GenerateImageOptions): Promise<Buffer> {
  const { prompt, model, size, quality, timeout, format = 'webp' } = options;
  const client = initializeOpenAI();
  const controller = new AbortController();

  const response = await withTimeout(
    client.images.generate({
      model,
      prompt,
      size: size as NonNullable<Parameters<typeof client.images.generate>[0]['size']>,
      quality,
      n: 1,
      output_format: format,
      output_compression: 85,
    }, { signal: controller.signal }),
    timeout,
    controller,
  );

  const usage = 'usage' in response ? response.usage : undefined;
  console.log(JSON.stringify({
    event: 'llm_usage',
    provider: 'openai',
    model,
    stage: 'generateImage',
    promptTokenCount: usage?.input_tokens ?? null,
    candidatesTokenCount: usage?.output_tokens ?? null,
    totalTokenCount: usage?.total_tokens ?? null,
  }));

  const b64 = 'data' in response ? response.data?.[0]?.b64_json : undefined;
  if (!b64) throw new Error(`이미지 응답에 데이터가 없습니다 (${model})`);
  return Buffer.from(b64, 'base64');
}
