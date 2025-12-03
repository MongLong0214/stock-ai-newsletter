#!/usr/bin/env tsx
/**
 * 블로그 포스트 자동 생성 스크립트
 *
 * [사용법]
 *   npm run generate-blog                    # AI 동적 키워드 5개 생성 (기본)
 *
 * [특징]
 *   - Gemini AI가 매일 새로운 키워드 자동 생성
 *   - Supabase 중복 체크로 중복 방지
 *   - 키워드 품질 점수 기반 선택
 *   - 항상 5개 블로그 생성
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { generateWithDynamicKeywords } from '@/app/blog/pipeline';

async function main(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║            🚀 Stock Matrix 블로그 자동 생성 시스템                 ║
║                   AI 동적 키워드 5개 생성                          ║
╚════════════════════════════════════════════════════════════════════╝
`);

  // 필수 환경변수 확인
  const requiredEnvVars = [
    'SERP_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingEnvVars.length > 0) {
    console.error(`❌ 필수 환경변수가 설정되지 않았습니다:`);
    missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
    process.exit(1);
  }

  console.log('\n🔍 브라우저 가용성 자동 체크...');
  console.log('   ℹ️ 브라우저 미설치 시 HTTP 모드로 자동 전환됩니다.\n');

  try {
    // AI 동적 키워드 5개 생성
    const results = await generateWithDynamicKeywords({
      publish: true,
      count: 5,
      minRelevanceScore: 7.5,
    });

    // 결과 출력
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 최종 결과`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ✅ 성공: ${successful.length}개`);
    console.log(`   ❌ 실패: ${failed.length}개`);

    if (failed.length > 0) {
      console.log(`\n실패한 항목:`);
      failed.forEach((r) => console.log(`   - ${r.error}`));
    }

    if (successful.length > 0) {
      console.log(`\n✅ 생성된 블로그:`);
      successful.forEach((r, idx) => {
        if (r.blogPost) {
          console.log(`\n${idx + 1}. ${r.blogPost.title}`);
          console.log(`   키워드: ${r.blogPost.target_keyword}`);
          console.log(`   슬러그: /blog/${r.blogPost.slug}`);
          console.log(`   상태: ${r.blogPost.status}`);
        }
      });
    }

    process.exit(failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error);
    process.exit(1);
  }
}

main();