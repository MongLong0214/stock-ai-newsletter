/** 블로그 포스트 Supabase 저장소 (Repository Pattern) */

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { createBlogPostingSchema } from '../_utils/schema-generator';
import { notifyIndexNow } from '@/lib/indexnow';
import { siteConfig } from '@/lib/constants/seo/config';
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

  // upsert(onConflict:'slug')는 같은 슬러그를 만나면 기존 행을 통째로 갈아엎는다.
  // 초안 저장이 이미 공개된 글을 draft로 내리면 색인된 URL이 404가 되고 되돌릴 수 없다.
  // generateSlug의 해시 접미사로 충돌 확률은 없앴지만, 여기서 한 번 더 막는다.
  const { data: existing, error: lookupError } = await supabase
    .from('blog_posts')
    .select('status')
    .eq('slug', input.slug)
    .maybeSingle<{ status: string }>();

  // 조회 실패를 "행 없음"으로 읽으면 그 순간 보호가 사라진다 — 공개글을 덮어쓸 수 있다
  if (lookupError) {
    throw new Error(`슬러그 충돌 확인 실패(${input.slug}): ${lookupError.message} — 저장을 중단한다`);
  }

  // published 행은 어떤 경우에도 파이프라인이 덮어쓰지 않는다. draft로 내리는 것뿐 아니라
  // published→published 갱신도 막는다 — 살아 있는 본문이 통째로 교체되고 되돌릴 수 없다.
  if (existing?.status === 'published') {
    throw new Error(
      `슬러그 충돌: /blog/${input.slug}는 이미 발행된 글이다 — 기존 공개글을 덮어쓰지 않도록 중단한다`,
    );
  }

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

  // 이미 발행된 글의 수정도 재크롤 대상이다. 발행 시점(publishBlogPost)에만 알리면
  // 종목 수치 정정 같은 변경이 Bing·네이버에 영영 전달되지 않는다.
  if (status === 'published') {
    await notifyIndexNow([`${siteConfig.domain}/blog/${input.slug}`]);
  }

  return data;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 오늘(KST) 이미 발행된 글 수.
 *
 * MAX_DAILY_PUBLISH는 이름과 달리 **호출당** 상한이었다. 크론이 3편을 낸 뒤 재실행하거나
 * workflow_dispatch를 누르면 DB를 보지 않고 또 3편을 발행한다. 하루 상한이려면
 * 그날 이미 나간 수를 세야 한다.
 */
export async function countPublishedToday(now: number = Date.now()): Promise<number> {
  const supabase = getServerSupabaseClient();
  const kstMidnightUtc = new Date(
    Math.floor((now + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS,
  ).toISOString();

  const { count, error } = await supabase
    .from('blog_posts')
    .select('slug', { count: 'exact', head: true })
    .eq('status', 'published')
    .gte('published_at', kstMidnightUtc);

  // 셀 수 없으면 발행하지 않는다 — 상한을 모른 채 발행하느니 그날을 거른다
  if (error) throw new Error(`오늘 발행 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}

/**
 * 저장 타임아웃 뒤 실제 커밋 여부 확인용.
 *
 * withTimeout은 Promise.race라 요청을 취소하지 못한다. 로컬 30초가 먼저 끊겨도
 * 서버는 31초에 커밋할 수 있고, 그러면 "저장 실패"로 기록된 글이 실제로는 공개돼 있다.
 */
export async function findBlogPostStatus(
  slug: string,
): Promise<{ status: string; title: string; updated_at: string | null } | null> {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('status, title, updated_at')
    .eq('slug', slug)
    .maybeSingle<{ status: string; title: string; updated_at: string | null }>();
  return data ?? null;
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

  // IndexNow: 발행 즉시 Bing·네이버에 통보 (실패해도 발행에 영향 없음)
  await notifyIndexNow([`${siteConfig.domain}/blog/${slug}`]);

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
