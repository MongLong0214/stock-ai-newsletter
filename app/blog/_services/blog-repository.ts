/**
 * 블로그 저장소 서비스
 * Supabase 기반 블로그 포스트 CRUD 작업
 */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { SITE_INFO } from '../_config/pipeline-config';
import type {
  BlogPost,
  BlogPostCreateInput,
  BlogPostListItem,
  SchemaData,
} from '../_types/blog';

/**
 * Schema.org 구조화 데이터 생성
 */
function buildSchemaData(
  post: BlogPostCreateInput,
  slug: string
): SchemaData {
  const now = new Date().toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Organization',
      name: SITE_INFO.name,
      url: SITE_INFO.domain,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_INFO.name,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_INFO.domain}/logo.png`,
      },
    },
    datePublished: now,
    dateModified: now,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_INFO.domain}/blog/${slug}`,
    },
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };
}

/**
 * 블로그 포스트 저장
 */
export async function saveBlogPost(
  input: BlogPostCreateInput
): Promise<BlogPost> {
  const supabase = getServerSupabaseClient();

  // Schema.org 데이터 생성
  const schemaData = buildSchemaData(input, input.slug);

  // 저장할 데이터 준비
  const postData = {
    ...input,
    schema_data: schemaData,
    competitor_count: input.competitor_urls?.length || 0,
    status: input.status || 'draft',
  };

  const { data, error } = await supabase
    .from('blog_posts')
    .upsert(postData, { onConflict: 'slug' })
    .select()
    .single();

  if (error) {
    throw new Error(`블로그 포스트 저장 실패: ${error.message}`);
  }

  return data as BlogPost;
}

/**
 * 블로그 포스트 발행
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
    .single();

  if (error) {
    throw new Error(`발행 실패: ${error.message}`);
  }

  return data as BlogPost;
}

/**
 * 슬러그로 블로그 포스트 조회
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`조회 실패: ${error.message}`);
  }

  return data as BlogPost;
}

/**
 * 발행된 블로그 포스트 목록 조회
 */
export async function getPublishedBlogPosts(
  limit: number = 20,
  offset: number = 0
): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`목록 조회 실패: ${error.message}`);
  }

  return data as BlogPostListItem[];
}

/**
 * 전체 발행된 포스트 수 조회
 */
export async function getPublishedPostCount(): Promise<number> {
  const supabase = getServerSupabaseClient();

  const { count, error } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  if (error) {
    throw new Error(`카운트 조회 실패: ${error.message}`);
  }

  return count || 0;
}

/**
 * 카테고리별 블로그 포스트 조회
 */
export async function getBlogPostsByCategory(
  category: string,
  limit: number = 10
): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .eq('category', category)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`카테고리 조회 실패: ${error.message}`);
  }

  return data as BlogPostListItem[];
}

/**
 * 관련 포스트 조회 (태그 기반)
 */
export async function getRelatedPosts(
  currentSlug: string,
  tags: string[],
  limit: number = 3
): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .neq('slug', currentSlug)
    .overlaps('tags', tags)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`관련 포스트 조회 실패: ${error.message}`);
  }

  return data as BlogPostListItem[];
}

/**
 * 조회수 증가
 */
export async function incrementViewCount(slug: string): Promise<void> {
  const supabase = getServerSupabaseClient();

  // 조회수 증가 실패는 무시 (사용자 경험에 영향 없음)
  await supabase.rpc('increment_blog_view_count', { post_slug: slug });
}

/**
 * 블로그 포스트 삭제
 */
export async function deleteBlogPost(slug: string): Promise<void> {
  const supabase = getServerSupabaseClient();

  const { error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('slug', slug);

  if (error) {
    throw new Error(`삭제 실패: ${error.message}`);
  }
}

/**
 * 발행된 모든 슬러그 조회 (sitemap용)
 */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  if (error) {
    throw new Error(`슬러그 조회 실패: ${error.message}`);
  }

  return data.map((post) => post.slug);
}