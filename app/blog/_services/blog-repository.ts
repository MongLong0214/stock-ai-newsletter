/** 블로그 포스트 Supabase 저장소 (Repository Pattern) */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { createBlogPostingSchema } from '../_utils/schema-generator';
import type { BlogPost, BlogPostCreateInput } from '../_types/blog';

/**
 * 블로그 포스트 저장 (slug 기준 upsert)
 * @param input - 저장할 블로그 포스트 데이터
 * @returns 저장된 블로그 포스트
 */
export async function saveBlogPost(
  input: BlogPostCreateInput
): Promise<BlogPost> {
  const supabase = getServerSupabaseClient();
  const schemaData = createBlogPostingSchema(input, input.slug);
  const status = input.status || 'draft';

  const postData = {
    ...input,
    schema_data: schemaData,
    competitor_count: input.competitor_urls?.length || 0,
    status,
    ...(status === 'published' && {
      published_at: input.published_at || new Date().toISOString(),
    }),
  };

  const { data, error } = await supabase
    .from('blog_posts')
    .upsert(postData, { onConflict: 'slug' })
    .select()
    .single<BlogPost>();

  if (error) {
    throw new Error(`블로그 포스트 저장 실패: ${error.message}`);
  }

  return data;
}

/**
 * 블로그 포스트 발행 (status: published, published_at 기록)
 * @param slug - 발행할 포스트의 슬러그
 * @returns 발행된 블로그 포스트
 */
export async function publishBlogPost(slug: string): Promise<BlogPost> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select()
    .single<BlogPost>();

  if (error) {
    throw new Error(`발행 실패: ${error.message}`);
  }

  return data;
}

/**
 * 블로그 포스트 조회수 증가 (RPC 원자적 연산, fallback 포함)
 * @param slug - 조회수를 증가시킬 포스트의 슬러그
 */
export async function incrementViewCount(slug: string): Promise<void> {
  const supabase = getServerSupabaseClient();

  const { error } = await supabase.rpc('increment_blog_view_count', { post_slug: slug });

  if (error?.code === '42883') {
    // RPC 함수 미존재 시 fallback
    // 주의: read-then-write 패턴이므로 동시 요청 시 카운트가 유실될 수 있음
    const { data: currentPost } = await supabase
      .from('blog_posts')
      .select('view_count')
      .eq('slug', slug)
      .single();

    if (currentPost) {
      await supabase
        .from('blog_posts')
        .update({ view_count: (currentPost.view_count || 0) + 1 })
        .eq('slug', slug);
    }
  } else if (error) {
    console.error('조회수 증가 실패:', error.message);
  }
}
