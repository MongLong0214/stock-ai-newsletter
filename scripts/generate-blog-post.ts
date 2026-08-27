#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { generateWithDynamicKeywords, DAILY_POST_COUNT } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';

const SCRIPT_TIMEOUT_MS = 25 * 60 * 1000;

let exiting = false;

const cleanup = async () => {
  if (exiting) return;
  exiting = true;
  await Promise.race([
    closeBrowser(),
    new Promise(r => setTimeout(r, 5000)),
  ]).catch(() => {});
};

const exit = (code: number) => {
  cleanup().finally(() => process.exit(code));
};

process.on('unhandledRejection', e => { console.error('Unhandled:', e); exit(1); });
process.on('uncaughtException', e => { console.error('Uncaught:', e); exit(1); });
// 취소도 실패다 — exit(0)이면 CI가 초록으로 끝나 아무도 그날 발행이 없었다는 걸 모른다
process.on('SIGINT', () => exit(1));
process.on('SIGTERM', () => exit(1));
setTimeout(() => { console.error('\n타임아웃 (25분)'); exit(1); }, SCRIPT_TIMEOUT_MS).unref();

(async () => {
  console.log('블로그 자동 생성 시작\n');

  // 검색량 게이트가 없으면 AI가 지어낸 추정 검색량으로 발행된다 — 자동 공개 경로에서는 필수다
  const hasAdCreds = process.env.NAVER_AD_CREDS
    || (process.env.NAVER_AD_CUSTOMER_ID && process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET_KEY);
  const missing = ['SERP_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (!hasAdCreds) missing.push('NAVER_AD_CREDS (또는 NAVER_AD_CUSTOMER_ID/API_KEY/SECRET_KEY)');
  if (missing.length) { console.error(`환경변수 누락: ${missing.join(', ')}`); return exit(1); }

  try {
    const results = await generateWithDynamicKeywords({ publish: true, count: DAILY_POST_COUNT });
    const ok = results.filter(r => r.success).length;
    // draft 저장 성공은 공개 발행이 아니다. 이걸 섞어 세면 발행 0건인 날도 CI가 초록이 된다.
    const published = results.filter(r => r.success && r.blogPost.status === 'published').length;
    console.log(`\n결과: 공개 ${published}편 / 저장 성공 ${ok}편 / 실패 ${results.length - ok}편`);
    results.forEach((r, i) => { if (r.success) console.log(`   ${i + 1}. [${r.blogPost.status}] ${r.blogPost.title}`); });
    if (published === 0) {
      console.error('공개 발행 0건 — 실패로 처리합니다');
      return exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return exit(1);
  }

  console.log('\n완료');
  exit(0);
})();
