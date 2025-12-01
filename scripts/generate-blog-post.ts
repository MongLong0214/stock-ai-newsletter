#!/usr/bin/env tsx
/**
 * 블로그 포스트 자동 생성 스크립트
 *
 * 사용법:
 *   npm run generate-blog
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import { generateFromTargetKeywords } from '@/app/blog/pipeline';

async function main(): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║            🚀 Stock Matrix 블로그 콘텐츠 자동화 시스템             ║
╚════════════════════════════════════════════════════════════════════╝
`);

  const requiredEnvVars = [
    'SERP_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'NEXT_PUBLIC_SUPABASE_URL',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingEnvVars.length > 0) {
    console.error(`❌ 필수 환경변수가 설정되지 않았습니다:`);
    missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
    process.exit(1);
  }

  try {
    const results = await generateFromTargetKeywords({
      publish: false,
    });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 최종 결과`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   ✅ 성공: ${successful.length}개`);
    console.log(`   ❌ 실패: ${failed.length}개`);

    if (failed.length > 0) {
      console.log(`\n실패한 키워드:`);
      failed.forEach((r) => console.log(`   - ${r.error}`));
    }

    process.exit(failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error);
    process.exit(1);
  }
}

main();