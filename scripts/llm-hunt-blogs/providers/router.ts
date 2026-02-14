/**
 * LLM 라우팅 — 프로바이더 감지, 라운드로빈, 폴백 체인
 */

import type { Provider, WorkingKeys } from '../types';
import { pickRandom } from '../utils';
import { callOpenAI } from './openai';
import { callGoogle } from './google';
import { callGroq } from './groq';

let roundRobinIndex = 0;

// --- 환경변수 / Working Keys 기반 프로바이더 감지 ---
export function detectProviders(keys: WorkingKeys): Provider[] {
  const providers: Provider[] = [];

  const openaiKey = process.env.OPENAI_API_KEY || pickRandom(keys.openai || [])?.key;
  const googleKey = process.env.GEMINI_API_KEY || pickRandom(keys.google || [])?.key;
  const groqKey = process.env.GROQ_API_KEY || pickRandom(keys.groq || [])?.key;

  if (openaiKey) providers.push({ name: 'openai', call: (p) => callOpenAI(p, openaiKey) });
  if (googleKey) providers.push({ name: 'google', call: (p) => callGoogle(p, googleKey) });
  if (groqKey) providers.push({ name: 'groq', call: (p) => callGroq(p, groqKey) });

  return providers;
}

// --- 라운드로빈 분배 (키워드 생성용) ---
export function callLLMRoundRobin(providers: Provider[], prompt: string): Promise<string> {
  const provider = providers[roundRobinIndex % providers.length];
  roundRobinIndex++;
  console.log(`[LLM] 라운드로빈 → ${provider.name}`);
  return provider.call(prompt);
}

// --- 폴백 체인 (콘텐츠 생성용) ---
export async function callLLMWithFallback(providers: Provider[], prompt: string): Promise<string> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      console.log(`[LLM] 콘텐츠 생성 → ${provider.name}${i > 0 ? ' (fallback)' : ''}`);
      return await provider.call(prompt);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[LLM] ${provider.name} 실패: ${msg}`);
      if (i === providers.length - 1) throw error;
    }
  }

  throw new Error('모든 LLM 프로바이더 실패');
}
