/**
 * 상수 및 LLM 모델 설정
 */

import { resolve } from 'path';

// --- Paths ---
export const DATA_DIR = resolve(__dirname, 'data');
export const WORKING_KEYS_FILE = resolve(DATA_DIR, 'ctf-keys-working.json');
export const KEYS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

// --- Script ---
export const SCRIPT_TIMEOUT_MS = 60 * 60 * 1000; // 60분
export const BATCH_DELAY_MS = 3_000;
export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 2_000;
export const PER_PROVIDER = 5;
export const SELECT_COUNT = 10;
export const QUALITY_MIN_SCORE = 60;
export const EXISTING_POSTS_LIMIT = 150;

// --- Timeouts (ms) ---
export const TIMEOUTS = {
  search: 60_000,       // 1분
  scrape: 120_000,      // 2분
  generate: 300_000,    // 5분 (reasoning 모델 대응)
  save: 30_000,         // 30초
  keyword: 300_000,     // 5분 (reasoning 모델 대응)
  evaluate: 120_000,    // 2분 (AI 선별)
  llmCall: 120_000,     // 2분 (개별 LLM 호출)
} as const;

// --- LLM Models ---
export const MODELS = {
  openai: 'gpt-5.2',
  google: 'gemini-3-pro-preview',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
} as const;

// --- Required Environment Variables ---
export const REQUIRED_ENV_VARS = [
  'SERP_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;
