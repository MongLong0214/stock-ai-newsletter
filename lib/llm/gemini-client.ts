/**
 * 재사용 가능한 Gemini 클라이언트 래퍼
 */

import { GoogleGenAI } from '@google/genai';
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
  const {
    prompt,
    config = {},
    timeout = 120000,
  } = options;

  const genAI = initializeGemini();

  const response = await withTimeout(
    genAI.models.generateContent({
      model: config.model || GEMINI_API_CONFIG.MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: config.maxOutputTokens || GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS,
        temperature: config.temperature ?? GEMINI_API_CONFIG.TEMPERATURE,
        topP: config.topP ?? GEMINI_API_CONFIG.TOP_P,
        topK: config.topK ?? GEMINI_API_CONFIG.TOP_K,
        responseMimeType: config.responseMimeType || GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
      },
    }),
    timeout
  );

  return response.text || '';
}