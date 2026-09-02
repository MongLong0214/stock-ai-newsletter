import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import { isValidBlogSlug } from '../blog/_utils/slug-validator';

// 1시간마다 재생성 (블로그 sitemap/목록과 동일 주기)
export const revalidate = 3600;

const FEED_ITEM_LIMIT = 50;
const CHANNEL_TITLE = `${siteConfig.serviceName} 블로그`;
const CHANNEL_DESCRIPTION =
  `KOSPI·KOSDAQ 주식 분석, 30개 기술적 지표, 테마·종목 투자 가이드 — ${siteConfig.serviceName} 블로그 최신 글`;

interface FeedPost {
  slug: string;
  title: string;
  description: string | null;
  meta_description: string | null;
  published_at: string | null;
  updated_at: string | null;
  tags: string[] | null;
}

/** XML 텍스트 노드 이스케이프 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** RSS pubDate는 RFC-822 형식 요구 */
function toRfc822(dateStr: string | null): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toUTCString();
}

async function getFeedPosts(): Promise<FeedPost[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, title, description, meta_description, published_at, updated_at, tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(FEED_ITEM_LIMIT);

    if (error) throw error;
    return (data || []).filter((p) => isValidBlogSlug(p.slug));
  } catch (error) {
    console.error('[Feed] 블로그 조회 실패', error);
    return [];
  }
}

export async function GET() {
  const baseUrl = siteConfig.domain;
  const feedUrl = `${baseUrl}/feed.xml`;
  const posts = await getFeedPosts();
  const lastBuildDate = toRfc822(posts[0]?.published_at ?? null);

  const items = posts
    .map((post) => {
      const url = `${baseUrl}/blog/${post.slug}`;
      const summary = post.description || post.meta_description || post.title;
      const categories = (post.tags || [])
        .slice(0, 5)
        .map((tag) => `<category>${escapeXml(tag)}</category>`)
        .join('');
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${toRfc822(post.published_at)}</pubDate>
      <description><![CDATA[${summary}]]></description>
${categories ? `      ${categories}\n` : ''}    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(CHANNEL_TITLE)}</title>
    <link>${baseUrl}/blog</link>
    <description>${escapeXml(CHANNEL_DESCRIPTION)}</description>
    <language>ko</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
