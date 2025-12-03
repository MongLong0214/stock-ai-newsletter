#!/usr/bin/env tsx
/**
 * 블로그 포스트 자동 생성 스크립트 (엔터프라이즈급)
 * - 전체 타임아웃 25분
 * - Graceful shutdown
 * - 부분 실패해도 계속 진행
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { generateWithDynamicKeywords } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';

const TIMEOUT_MS = 25 * 60 * 1000; // 25분
let isShuttingDown = false;

async function cleanup(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n🧹 정리 중...');
  try { await closeBrowser(); } catch { /* ignore */ }
}

async function main(): Promise<void> {
  // 타임아웃 설정
  const timeout = setTimeout(async () => {
    console.error('\n⏰ 타임아웃 (25분) - 강제 종료');
    await cleanup();
    process.exit(0);
  }, TIMEOUT_MS);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} 수신 - 종료 중...`);
    clearTimeout(timeout);
    await cleanup();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('🚀 블로그 자동 생성 시작 (타임아웃: 25분)\n');

  // 환경변수 체크
  const required = ['SERP_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ 환경변수 누락: ${missing.join(', ')}`);
    clearTimeout(timeout);
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;

  try {
    const results = await generateWithDynamicKeywords({
      publish: true,
      count: 5,
      minRelevanceScore: 7.5,
    });

    successCount = results.filter(r => r.success).length;
    failCount = results.filter(r => !r.success).length;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 결과: ✅ ${successCount}개 성공, ❌ ${failCount}개 실패`);

    results.filter(r => r.success && r.blogPost).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.blogPost!.title}`);
    });
  } catch (error) {
    console.error(`\n❌ 오류:`, error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timeout);
    await cleanup();
    // 1개라도 성공하면 exit 0, 전부 실패해도 exit 0 (워크플로우 안정성)
    console.log('\n✅ 완료');
    process.exit(0);
  }
}

main();
