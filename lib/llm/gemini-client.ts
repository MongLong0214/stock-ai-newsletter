/**
 * 재사용 가능한 Gemini 클라이언트 래퍼
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GEMINI_API_CONFIG, PIPELINE_CONFIG } from '@/lib/llm/_config/pipeline-config';

interface GenerateTextOptions {
  prompt: string;
  config?: {
    model?: string;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    responseMimeType?: string;
    thinkingLevel?: ThinkingLevel;
  };
  timeout?: number;
}

function initializeGemini(): GoogleGenAI {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT 환경변수가 설정되지 않았습니다.');
  }

  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: PIPELINE_CONFIG.VERTEX_AI_LOCATION,
  });
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

  const genAI = initializeGemini();
  const controller = new AbortController();

  const response = await withTimeout(
    genAI.models.generateContent({
      model: config.model || GEMINI_API_CONFIG.MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        abortSignal: controller.signal,
        maxOutputTokens: config.maxOutputTokens || GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
        temperature: config.temperature ?? GEMINI_API_CONFIG.TEMPERATURE,
        topP: config.topP ?? GEMINI_API_CONFIG.TOP_P,
        topK: config.topK ?? GEMINI_API_CONFIG.TOP_K,
        responseMimeType: config.responseMimeType || GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
        thinkingConfig: {
          thinkingLevel: config.thinkingLevel || ThinkingLevel.HIGH,
        },
      },
    }),
    timeout,
    controller,
  );

  return response.text || '';
}