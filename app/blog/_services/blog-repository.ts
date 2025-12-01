/**
 * 블로그 저장소 서비스 (Repository Pattern)
 *
 * [이 파일의 역할]
 * - Supabase 데이터베이스와의 모든 통신을 담당
 * - 블로그 포스트의 저장, 수정, 발행 기능 제공
 *
 * [Repository 패턴이란?]
 * - 데이터 접근 로직을 비즈니스 로직과 분리
 * - 데이터베이스 종류가 바뀌어도 이 파일만 수정하면 됨
 * - 예: Supabase → PostgreSQL 직접 연결로 변경 시
 *
 * [Supabase란?]
 * - Firebase 대안으로 떠오르는 오픈소스 Backend-as-a-Service
 * - PostgreSQL 기반의 실시간 데이터베이스
 * - 인증, 스토리지, Edge Functions 등 제공
 *
 * [사용 흐름]
 * 1. 콘텐츠 생성 → saveBlogPost()로 초안 저장 (status: 'draft')
 * 2. 검토 완료 → publishBlogPost()로 발행 (status: 'published')
 *
 * [Schema.org 생성]
 * - Schema 생성은 _utils/schema-generator.ts에서 통합 관리
 * - 중복 로직 방지 및 Single Source of Truth 원칙 준수
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { createBlogPostingSchema } from '../_utils/schema-generator';
import type { BlogPost, BlogPostCreateInput } from '../_types/blog';

/**
 * 블로그 포스트 저장 (Create or Update)
 *
 * [Upsert란?]
 * - Update + Insert의 합성어
 * - 데이터가 있으면 업데이트, 없으면 새로 생성
 * - slug를 기준으로 중복 여부 판단 (onConflict: 'slug')
 *
 * [저장 흐름]
 * 1. Schema.org 데이터 자동 생성
 * 2. 경쟁사 URL 수 계산
 * 3. 기본 상태 'draft'로 설정
 * 4. Supabase에 upsert 실행
 *
 * @param input - 저장할 블로그 포스트 데이터
 * @returns 저장된 블로그 포스트 (DB에서 생성된 id, created_at 등 포함)
 * @throws 저장 실패 시 에러
 *
 * @example
 * const post = await saveBlogPost({
 *   title: '2024년 최고의 주식 뉴스레터',
 *   slug: 'best-stock-newsletter-2024',
 *   content: '...',
 *   ...
 * });
 */
export async function saveBlogPost(
  input: BlogPostCreateInput
): Promise<BlogPost> {
  // 서버 전용 Supabase 클라이언트 가져오기
  // (클라이언트와 달리 서비스 역할 키 사용)
  const supabase = getServerSupabaseClient();

  // Schema.org 구조화 데이터 생성 (schema-generator.ts에서 통합 관리)
  const schemaData = createBlogPostingSchema(input, input.slug);

  // 상태 결정 (기본값: draft)
  const status = input.status || 'draft';

  // 저장할 데이터 준비
  // - 입력 데이터에 schema_data, competitor_count, status, published_at 추가
  const postData = {
    ...input,
    schema_data: schemaData,
    // 경쟁사 URL 수 (분석에 사용된 경쟁사 개수)
    competitor_count: input.competitor_urls?.length || 0,
    // 포스트 상태
    status,
    // published 상태일 때 published_at 필수 (DB 제약 조건)
    // 입력에 published_at이 있으면 사용, 없으면 현재 시간 설정
    ...(status === 'published' && {
      published_at: input.published_at || new Date().toISOString(),
    }),
  };

  // Supabase에 upsert 실행
  // - upsert: slug가 같은 데이터가 있으면 업데이트, 없으면 새로 생성
  // - select(): 저장 후 데이터 반환 요청
  // - single(): 단일 객체로 반환 (배열이 아닌)
  const { data, error } = await supabase
    .from('blog_posts')
    .upsert(postData, { onConflict: 'slug' })
    .select()
    .single();

  // 에러 처리
  if (error) {
    throw new Error(`블로그 포스트 저장 실패: ${error.message}`);
  }

  return data as BlogPost;
}

/**
 * 블로그 포스트 발행
 *
 * [발행 처리]
 * - status를 'draft' → 'published'로 변경
 * - published_at에 현재 시간 기록
 * - 발행 후에는 블로그 목록과 상세 페이지에 노출됨
 *
 * @param slug - 발행할 포스트의 슬러그
 * @returns 발행된 블로그 포스트
 * @throws 발행 실패 시 에러 (포스트를 찾을 수 없는 경우 등)
 *
 * @example
 * const published = await publishBlogPost('best-stock-newsletter-2024');
 * console.log(published.status); // 'published'
 * console.log(published.published_at); // '2024-01-15T10:00:00.000Z'
 */
export async function publishBlogPost(slug: string): Promise<BlogPost> {
  const supabase = getServerSupabaseClient();

  // 발행 상태로 업데이트
  const { data, error } = await supabase
    .from('blog_posts')
    .update({
      status: 'published',
      // 발행 시점 기록
      published_at: new Date().toISOString(),
    })
    // slug로 해당 포스트 찾기
    .eq('slug', slug)
    .select()
    .single();

  // 에러 처리
  if (error) {
    throw new Error(`발행 실패: ${error.message}`);
  }

  return data as BlogPost;
}