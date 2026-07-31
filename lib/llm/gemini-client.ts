/**
 * 재사용 가능한 Gemini 클라이언트 래퍼
 */

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GEMINI_API_CONFIG, PIPELINE_CONFIG } from '@/lib/llm/_config/pipeline-config';
import { LlmExecutionBudget } from '@/lib/llm/execution-budget';

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
  budget?: LlmExecutionBudget;
  signal?: AbortSignal;
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

export async function generateText(options: GenerateTextOptions): Promise<string> {
  const {
    prompt,
    config = {},
    timeout = PIPELINE_CONFIG.STAGE_TIMEOUT,
  } = options;

  const genAI = initializeGemini();
  const maxOutputTokens = config.maxOutputTokens ?? GEMINI_API_CONFIG.MAX_OUTPUT_TOKENS;
  const budget = options.budget ?? new LlmExecutionBudget({
    deadlineMs: Math.min(timeout, PIPELINE_CONFIG.GLOBAL_DEADLINE_MS),
    maxCalls: 1,
    maxReservedOutputTokens: maxOutputTokens,
    signal: options.signal,
  });

  const response = await budget.runCall({
    label: 'generate-text',
    timeoutMs: timeout,
    reservedOutputTokens: maxOutputTokens,
    operation: (signal) => genAI.models.generateContent({
      model: config.model ?? GEMINI_API_CONFIG.MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        abortSignal: signal,
        maxOutputTokens,
        temperature: config.temperature ?? GEMINI_API_CONFIG.TEMPERATURE,
        topP: config.topP ?? GEMINI_API_CONFIG.TOP_P,
        topK: config.topK ?? GEMINI_API_CONFIG.TOP_K,
        responseMimeType: config.responseMimeType ?? GEMINI_API_CONFIG.RESPONSE_MIME_TYPE,
        thinkingConfig: {
          thinkingLevel: config.thinkingLevel ?? ThinkingLevel.HIGH,
        },
      },
    }),
  });

  return response.text || '';
}