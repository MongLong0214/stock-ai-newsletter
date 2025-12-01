#!/usr/bin/env tsx
/**
 * 블로그 포스트 생성 CLI 스크립트
 *
 * 사용법:
 *   npx tsx scripts/generate-blog-post.ts --keyword "주식 뉴스레터 추천" --type guide
 *   npx tsx scripts/generate-blog-post.ts --batch --limit 3 --publish
 *   npx tsx scripts/generate-blog-post.ts --check-usage
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// 환경변수 로드
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  config({ path: envPath });
}

import {
  generateBlogPost,
  generateFromTargetKeywords,
} from '@/app/blog/pipeline';
import { checkApiUsage } from '@/app/blog/_services/serp-api';

/**
 * 유효한 콘텐츠 타입 목록
 * - comparison: 비교 글
 * - guide: 가이드 글
 * - listicle: 리스트 글
 * - review: 리뷰 글
 */
const VALID_CONTENT_TYPES = ['comparison', 'guide', 'listicle', 'review'] as const;
type ContentType = (typeof VALID_CONTENT_TYPES)[number];

/**
 * CLI 인자 파싱 결과 타입
 */
interface ParsedArgs {
  keyword?: string;
  type: ContentType;
  publish: boolean;
  batch: boolean;
  limit?: number;
  priority?: number;
  checkUsage: boolean;
}

/**
 * 값이 유효한 콘텐츠 타입인지 확인하는 타입 가드
 */
function isValidContentType(value: string | undefined): value is ContentType {
  return value !== undefined && VALID_CONTENT_TYPES.includes(value as ContentType);
}

/**
 * CLI 인자를 파싱하여 구조화된 객체로 반환
 *
 * [지원하는 옵션]
 * - --keyword, -k: 타겟 키워드
 * - --type, -t: 콘텐츠 타입
 * - --publish, -p: 발행 여부
 * - --batch, -b: 배치 모드
 * - --limit, -l: 배치 제한
 * - --priority: 우선순위 필터
 * - --check-usage, -u: API 사용량 확인
 * - --help, -h: 도움말
 */
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    keyword: undefined,
    type: 'guide',
    publish: false,
    batch: false,
    limit: undefined,
    priority: undefined,
    checkUsage: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg: string | undefined = args[i + 1];

    switch (arg) {
      case '--keyword':
      case '-k':
        // nextArg 유효성 검증: undefined이거나 다른 플래그인 경우 에러
        if (nextArg === undefined || nextArg.startsWith('-')) {
          console.error('❌ --keyword 옵션에 값이 필요합니다.');
          process.exit(1);
        }
        result.keyword = nextArg;
        i++;
        break;
      case '--type':
      case '-t':
        // 타입 가드를 사용한 안전한 타입 검증
        if (!isValidContentType(nextArg)) {
          console.error(`❌ 유효하지 않은 타입: ${nextArg ?? '(없음)'}`);
          console.error(`   유효한 타입: ${VALID_CONTENT_TYPES.join(', ')}`);
          process.exit(1);
        }
        result.type = nextArg;
        i++;
        break;
      case '--publish':
      case '-p':
        result.publish = true;
        break;
      case '--batch':
      case '-b':
        result.batch = true;
        break;
      case '--limit':
      case '-l': {
        // nextArg 유효성 검증
        if (nextArg === undefined || nextArg.startsWith('-')) {
          console.error('❌ --limit 옵션에 숫자 값이 필요합니다.');
          process.exit(1);
        }
        const limitValue = parseInt(nextArg, 10);
        if (Number.isNaN(limitValue) || limitValue < 1) {
          console.error(`❌ --limit 값이 유효하지 않습니다: ${nextArg}`);
          process.exit(1);
        }
        result.limit = limitValue;
        i++;
        break;
      }
      case '--priority': {
        // nextArg 유효성 검증
        if (nextArg === undefined || nextArg.startsWith('-')) {
          console.error('❌ --priority 옵션에 숫자 값이 필요합니다.');
          process.exit(1);
        }
        const priorityValue = parseInt(nextArg, 10);
        if (Number.isNaN(priorityValue) || priorityValue < 1 || priorityValue > 3) {
          console.error(`❌ --priority 값은 1-3 사이여야 합니다: ${nextArg}`);
          process.exit(1);
        }
        result.priority = priorityValue;
        i++;
        break;
      }
      case '--check-usage':
      case '-u':
        result.checkUsage = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
📝 블로그 포스트 생성 CLI

사용법:
  npx tsx scripts/generate-blog-post.ts [옵션]

옵션:
  -k, --keyword <keyword>    타겟 키워드 (단일 생성 모드)
  -t, --type <type>          콘텐츠 타입 (comparison|guide|listicle|review)
  -p, --publish              생성 후 바로 발행
  -b, --batch                사전 정의된 키워드로 배치 생성
  -l, --limit <n>            배치 모드에서 생성할 최대 포스트 수
  --priority <n>             배치 모드에서 우선순위 필터 (1-3)
  -u, --check-usage          SerpApi 사용량 확인
  -h, --help                 도움말 출력

예시:
  # 단일 키워드로 블로그 생성
  npx tsx scripts/generate-blog-post.ts -k "주식 뉴스레터 추천" -t listicle

  # 생성 후 바로 발행
  npx tsx scripts/generate-blog-post.ts -k "AI 주식 분석" -t guide -p

  # 배치 모드 (사전 정의된 키워드)
  npx tsx scripts/generate-blog-post.ts -b -l 3

  # 높은 우선순위 키워드만 배치 생성
  npx tsx scripts/generate-blog-post.ts -b --priority 1 -p

  # API 사용량 확인
  npx tsx scripts/generate-blog-post.ts -u
`);
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║            🚀 Stock Matrix 블로그 콘텐츠 자동화 시스템             ║
╚════════════════════════════════════════════════════════════════════╝
`);

  // 환경변수 확인
  const requiredEnvVars = [
    'SERP_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'NEXT_PUBLIC_SUPABASE_URL',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingEnvVars.length > 0 && !args.checkUsage) {
    console.error(`❌ 필수 환경변수가 설정되지 않았습니다:`);
    missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
    process.exit(1);
  }

  try {
    // API 사용량 확인 모드
    if (args.checkUsage) {
      console.log(`📊 SerpApi 사용량 확인 중...\n`);
      const usage = await checkApiUsage();
      console.log(`   사용량: ${usage.used} / ${usage.limit}`);
      console.log(`   잔여: ${usage.remaining}회`);
      console.log(`   사용률: ${((usage.used / usage.limit) * 100).toFixed(1)}%`);
      process.exit(0);
    }

    // 배치 모드
    if (args.batch) {
      console.log(`📦 배치 모드 실행`);
      console.log(`   발행: ${args.publish ? '예' : '아니오'}`);
      if (args.limit) console.log(`   제한: ${args.limit}개`);
      if (args.priority) console.log(`   우선순위: ${args.priority} 이하`);
      console.log();

      const results = await generateFromTargetKeywords({
        publish: args.publish,
        priorityFilter: args.priority,
        limit: args.limit,
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
    }

    // 단일 키워드 모드
    if (args.keyword) {
      console.log(`📝 단일 키워드 모드`);
      console.log(`   키워드: "${args.keyword}"`);
      console.log(`   타입: ${args.type}`);
      console.log(`   발행: ${args.publish ? '예' : '아니오'}`);
      console.log();

      const result = await generateBlogPost(args.keyword, args.type, {
        publish: args.publish,
      });

      if (result.success) {
        console.log(`\n✅ 성공적으로 생성되었습니다!`);
        console.log(`   슬러그: ${result.blogPost?.slug}`);
        console.log(`   소요 시간: ${(result.metrics.totalTime / 1000).toFixed(1)}초`);
        process.exit(0);
      } else {
        console.error(`\n❌ 생성 실패: ${result.error}`);
        process.exit(1);
      }
    }

    // 인자가 없는 경우
    printHelp();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error);
    process.exit(1);
  }
}

main();