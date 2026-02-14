#!/usr/bin/env tsx
/**
 * Multi-LLM 블로그 자동 생성 — 엔트리 포인트
 *
 * 실행: npx tsx scripts/llm-hunt-blogs/index.ts
 *
 * 파이프라인:
 *   1. CTF Key Hunter로 API 키 갱신 (24시간 초과 시)
 *   2. 키워드 생성 (프로바이더 수 × 5개)
 *   3. 초안 생성 (프로바이더별 라운드로빈 할당)
 *   4. AI 선별 + 기존 블로그 중복 검증 → 상위 10개
 *   5. 저장 & 발행 + Google Indexing 알림
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { closeBrowser } from '@/app/blog/_services/web-scraper';
import { SCRIPT_TIMEOUT_MS, REQUIRED_ENV_VARS } from './constants';
import { isKeysFresh, refreshWorkingKeys, loadWorkingKeys } from './key-hunter/manager';
import { detectProviders } from './providers/router';
import { runPipeline } from './pipeline/runner';
// --- 환경변수 로드 ---
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

// --- 프로세스 관리 ---
let exiting = false;

const cleanup = async () => {
  if (exiting) return;
  exiting = true;
  await Promise.race([closeBrowser(), new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
};

const exit = (code: number) => {
  cleanup().finally(() => process.exit(code));
};

process.on('unhandledRejection', (e) => { console.error('Unhandled:', e); exit(1); });
process.on('uncaughtException', (e) => { console.error('Uncaught:', e); exit(1); });
process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));
setTimeout(() => { console.error('\n타임아웃 (60분)'); exit(1); }, SCRIPT_TIMEOUT_MS).unref();

// --- 메인 ---
(async () => {
  console.log('블로그 자동 생성 시작 (Multi-LLM)\n');

  // 환경변수 확인
  const missingCore = REQUIRED_ENV_VARS.filter((k) => !process.env[k]);
  if (missingCore.length) {
    console.error(`환경변수 누락: ${missingCore.join(', ')}`);
    return exit(1);
  }

  // Working keys 갱신
  if (!isKeysFresh()) {
    console.log('[Pipeline] ctf-keys-working.json 없거나 24시간 초과 — 자동 갱신');
    refreshWorkingKeys();
  } else {
    console.log('[Pipeline] ctf-keys-working.json 유효 (24시간 이내)');
  }

  const workingKeys = loadWorkingKeys();
  const keysSummary = Object.entries(workingKeys)
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : 0}`)
    .join(', ');
  if (keysSummary) console.log(`[Pipeline] Working keys: ${keysSummary}`);

  // 프로바이더 감지
  const providers = detectProviders(workingKeys);
  if (providers.length === 0) {
    console.error('LLM API 키 없음. env 또는 ctf-keys-working.json 필요.');
    return exit(1);
  }
  console.log(`사용 가능 LLM: ${providers.map((p) => p.name).join(', ')} (${providers.length}개)`);

  // 파이프라인 실행
  try {
    const results = await runPipeline(providers);
    const ok = results.filter((r) => r.success).length;
    console.log(`\n결과: ${ok}개 발행, ${results.length - ok}개 실패`);
    results.forEach((r, i) => {
      const qs = (r.metrics as { qualityScore?: number }).qualityScore || 0;
      if (r.success) console.log(`   ${i + 1}. [Q=${qs}] ${r.blogPost.title}`);
      else console.log(`   ${i + 1}. [실패] ${r.error}`);
    });
    if (ok === 0) return exit(1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
  }

  console.log('\n완료');
  exit(0);
})();
