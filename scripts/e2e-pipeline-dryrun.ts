#!/usr/bin/env tsx
/**
 * 파이프라인 e2e (draft-only) — 실제 API(SerpAPI·Gemini·네이버 검색광고·Supabase)로
 * 전 구간을 태우되 발행은 하지 않는다. 게이트 통과분은 status:draft로 저장된다.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

// 로컬 e2e: .env.local의 GOOGLE_APPLICATION_CREDENTIALS가 CI 전용 경로(service-account-key.json)를
// 가리키고 로컬엔 그 파일이 없다. 지워서 google-auth-library가 gcloud ADC로 폴백하게 한다.
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  console.log('[E2E] GOOGLE_APPLICATION_CREDENTIALS 파일 없음 — ADC 폴백');
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

import { generateWithDynamicKeywords } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';

async function main() {
  console.log('=== E2E DRY-RUN 시작 (publish: false) ===');
  // 게이트는 fail-closed다 — 자격증명이 없으면 키워드가 0개가 되어 draft도 안 나온다
  console.log('NAVER_AD 크리덴셜:', process.env.NAVER_AD_API_KEY ? '있음' : '없음 → 키워드 전량 탈락 예정');
  const started = Date.now();
  const results = await generateWithDynamicKeywords({ publish: false });
  console.log(`\n=== E2E 결과 (${Math.round((Date.now() - started) / 1000)}s) ===`);
  for (const r of results) {
    if (r.success) console.log(`DRAFT 저장: "${r.blogPost?.title}" [${r.blogPost?.target_keyword}]`);
    else console.log(`실패: ${r.error}`);
  }
  console.log(`합계: ${results.filter(r => r.success).length}/${results.length} draft`);
  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch(async (e) => { console.error('E2E 실패:', e); await closeBrowser().catch(() => {}); process.exit(1); });
