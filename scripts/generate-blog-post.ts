#!/usr/bin/env tsx
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

import { generateWithDynamicKeywords, DAILY_POST_COUNT, MAX_DAILY_PUBLISH } from '@/app/blog/pipeline';
import { closeBrowser } from '@/app/blog/_services/web-scraper';
import { countPublishedToday } from '@/app/blog/_services/blog-repository';

// gpt-6.1-sol 기준 단계별 최대 예산 약 70분(키워드 15 + 검색·스크랩 4 + 시세 1 + 생성 30.25 + 윤문 10.25
// + 시각자료 8 + 저장) + DB·발행 여유. 85분 CI 한도에 준비(npm ci·Playwright)·정리 시간을 남긴다.
const SCRIPT_TIMEOUT_MS = 75 * 60 * 1000;

let exiting = false;

const cleanup = async () => {
  await Promise.race([
    closeBrowser(),
    new Promise(r => setTimeout(r, 5000)),
  ]).catch(() => {});
};

// 처음 정해진 종료 코드만 쓴다. 정리(최대 5초) 중에 다른 경로가 exit(0)을 부르면 실패가 초록으로 덮인다.
const exit = (code: number) => {
  if (exiting) return;
  exiting = true;
  cleanup().finally(() => process.exit(code));
};

process.on('unhandledRejection', e => { console.error('Unhandled:', e); exit(1); });
process.on('uncaughtException', e => { console.error('Uncaught:', e); exit(1); });
// 취소도 실패다 — exit(0)이면 CI가 초록으로 끝나 아무도 그날 발행이 없었다는 걸 모른다
process.on('SIGINT', () => exit(1));
process.on('SIGTERM', () => exit(1));
setTimeout(() => { console.error(`\n타임아웃 (${SCRIPT_TIMEOUT_MS / 60_000}분)`); exit(1); }, SCRIPT_TIMEOUT_MS).unref();

(async () => {
  console.log('블로그 자동 생성 시작\n');

  // 검색량 게이트가 없으면 AI가 지어낸 추정 검색량으로 발행된다 — 자동 공개 경로에서는 필수다
  const hasAdCreds = process.env.NAVER_AD_CREDS
    || (process.env.NAVER_AD_CUSTOMER_ID && process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET_KEY);
  const missing = ['SERP_API_KEY', 'OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (!hasAdCreds) missing.push('NAVER_AD_CREDS (또는 NAVER_AD_CUSTOMER_ID/API_KEY/SECRET_KEY)');
  if (missing.length) { console.error(`환경변수 누락: ${missing.join(', ')}`); return exit(1); }

  try {
    // 오늘 이미 발행됐으면(수동 실행 뒤 cron, 재실행) 키워드·생성·이미지 비용을 쓰지 않고 끝낸다.
    // 끝까지 돌면 공개 0건 draft만 남고 CI는 빨갛게 끝나며, 그 draft가 같은 주제를 영구 차단한다.
    const already = await countPublishedToday();
    if (already >= MAX_DAILY_PUBLISH) {
      console.log(`오늘 이미 ${already}편 발행 (상한 ${MAX_DAILY_PUBLISH}) — 이번 실행은 건너뜁니다`);
      return exit(0);
    }

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
