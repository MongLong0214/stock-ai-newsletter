#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

if (existsSync(resolve(process.cwd(), '.env.local'))) config({ path: resolve(process.cwd(), '.env.local') });

import { generateWithDynamicKeywords } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';

let exiting = false;
const cleanup = async () => { if (exiting) return; exiting = true; await Promise.race([closeBrowser(), new Promise(r => setTimeout(r, 5000))]).catch(() => {}); };
const exit = (code: number) => { cleanup().finally(() => process.exit(code)); };

process.on('unhandledRejection', e => { console.error('❌ Unhandled:', e); exit(0); });
process.on('uncaughtException', e => { console.error('❌ Uncaught:', e); exit(0); });
process.on('SIGINT', () => exit(0));
process.on('SIGTERM', () => exit(0));
setTimeout(() => { console.error('\n⏰ 타임아웃 (25분)'); exit(0); }, 25 * 60 * 1000).unref();

(async () => {
  console.log('🚀 블로그 자동 생성 시작\n');

  const missing = ['SERP_API_KEY', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (missing.length) { console.error(`❌ 환경변수 누락: ${missing.join(', ')}`); return exit(1); }

  try {
    const results = await generateWithDynamicKeywords({ publish: true, count: 5 });
    const ok = results.filter(r => r.success).length;
    console.log(`\n📊 결과: ✅ ${ok}개 성공, ❌ ${results.length - ok}개 실패`);
    results.filter(r => r.success && r.blogPost).forEach((r, i) => console.log(`   ${i + 1}. ${r.blogPost!.title}`));
  } catch (e) { console.error('❌', e instanceof Error ? e.message : e); }

  console.log('\n✅ 완료');
  exit(0);
})();
