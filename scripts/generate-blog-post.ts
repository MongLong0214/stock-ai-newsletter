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
process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));
setTimeout(() => { console.error('\n타임아웃 (25분)'); exit(1); }, SCRIPT_TIMEOUT_MS).unref();

(async () => {
  console.log('블로그 자동 생성 시작\n');

  const missing = ['SERP_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`환경변수 누락: ${missing.join(', ')}`); return exit(1); }

  try {
    const results = await generateWithDynamicKeywords({ publish: true, count: DAILY_POST_COUNT });
    const ok = results.filter(r => r.success).length;
    console.log(`\n결과: ${ok}개 성공, ${results.length - ok}개 실패`);
    results.forEach((r, i) => { if (r.success) console.log(`   ${i + 1}. ${r.blogPost.title}`); });
    if (ok === 0) return exit(1);
  } catch (e) { console.error(e instanceof Error ? e.message : e); }

  console.log('\n완료');
  exit(0);
})();
