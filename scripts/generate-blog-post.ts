#!/usr/bin/env tsx
/**
 * 블로그 포스트 자동 생성 스크립트 (엔터프라이즈급)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { generateWithDynamicKeywords } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';

const TIMEOUT_MS = 25 * 60 * 1000;
let isShuttingDown = false;

async function cleanup(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try { await Promise.race([closeBrowser(), new Promise(r => setTimeout(r, 5000))]); } catch {}
}

function exit(code: number): never {
  cleanup().finally(() => process.exit(code));
  return undefined as never;
}

// 전역 에러 핸들러
process.on('unhandledRejection', (err) => { console.error('❌ Unhandled:', err); exit(0); });
process.on('uncaughtException', (err) => { console.error('❌ Uncaught:', err); exit(0); });
process.on('SIGINT', () => { console.log('\nSIGINT'); exit(0); });
process.on('SIGTERM', () => { console.log('\nSIGTERM'); exit(0); });

// 전체 타임아웃
const timeoutId = setTimeout(() => { console.error('\n⏰ 타임아웃 (25분)'); exit(0); }, TIMEOUT_MS);
timeoutId.unref();

async function main(): Promise<void> {
  console.log('🚀 블로그 자동 생성 시작 (타임아웃: 25분)\n');

  const required = ['SERP_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ 환경변수 누락: ${missing.join(', ')}`);
    return exit(1);
  }

  try {
    const results = await generateWithDynamicKeywords({ publish: true, count: 5, minRelevanceScore: 7.5 });
    const ok = results.filter(r => r.success).length;
    console.log(`\n${'='.repeat(50)}\n📊 결과: ✅ ${ok}개 성공, ❌ ${results.length - ok}개 실패`);
    results.filter(r => r.success && r.blogPost).forEach((r, i) => console.log(`   ${i + 1}. ${r.blogPost!.title}`));
  } catch (err) {
    console.error('❌ 오류:', err instanceof Error ? err.message : err);
  }

  console.log('\n✅ 완료');
  exit(0);
}

main();
