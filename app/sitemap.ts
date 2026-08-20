import { MetadataRoute } from 'next';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import { isValidBlogSlug } from './blog/_utils/slug-validator';

export const revalidate = 86400;

// 정적 페이지 실제 편집일 — 콘텐츠를 실제로 고칠 때만 수동 갱신한다.
// 빌드·배포만으로 lastmod를 갱신하지 않는다(lastmod 신뢰도 유지).
const STATIC_PAGE_UPDATED = new Date('2026-03-18');

/** 언어 alternates (단일언어 사이트용 x-default + ko) */
function withAlternates(url: string) {
  return {
    languages: {
      'ko': url,
      'x-default': url,
    },
  };
}

async function getPublishedBlogSlugs(): Promise<{ slug: string; published_at: string; updated_at: string | null }[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[Sitemap] 발행 블로그 조회 실패', error);
    throw error;
  }
}

async function getTopBlogTags(): Promise<string[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase
      .from('blog_posts')
      .select('tags')
      .eq('status', 'published');

    if (!data) return [];

    const tagCounts = new Map<string, number>();
    data.forEach((post) => {
      post.tags?.forEach((tag: string) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag]) => tag);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.domain;

  const [blogPosts, topTags] = await Promise.all([
    getPublishedBlogSlugs(),
    getTopBlogTags(),
  ]);

  // 동적 허브(홈·블로그·아카이브·테마 목록)의 lastmod = 발행 블로그의 실제 최신 갱신일.
  // 빌드 시각(new Date())을 쓰면 배포마다 lastmod가 바뀌어 신뢰도가 무너지므로 콘텐츠 실날짜를 쓴다.
  const latestContentDate = blogPosts.length
    ? new Date(Math.max(...blogPosts.map((p) => new Date(p.updated_at || p.published_at).getTime())))
    : STATIC_PAGE_UPDATED;

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: latestContentDate, changeFrequency: 'daily', priority: 1.0, alternates: withAlternates(baseUrl) },
    { url: `${baseUrl}/about`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/about`) },
    { url: `${baseUrl}/faq`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/faq`) },
    { url: `${baseUrl}/technical-indicators`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'monthly', priority: 0.9, alternates: withAlternates(`${baseUrl}/technical-indicators`) },
    { url: `${baseUrl}/subscribe`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'weekly', priority: 0.9, alternates: withAlternates(`${baseUrl}/subscribe`) },
    { url: `${baseUrl}/archive`, lastModified: latestContentDate, changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/archive`) },
    { url: `${baseUrl}/blog`, lastModified: latestContentDate, changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/blog`) },
    { url: `${baseUrl}/themes`, lastModified: latestContentDate, changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/themes`) },
    { url: `${baseUrl}/themes/methodology`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/themes/methodology`) },
    { url: `${baseUrl}/developers`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'monthly', priority: 0.6, alternates: withAlternates(`${baseUrl}/developers`) },
  ];

  const blogPages: MetadataRoute.Sitemap = blogPosts
    .filter((post) => isValidBlogSlug(post.slug))
    .map((post) => {
      const url = `${baseUrl}/blog/${post.slug}`;
      return {
        url,
        lastModified: new Date(post.updated_at || post.published_at),
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: withAlternates(url),
      };
    });

  const tagPages: MetadataRoute.Sitemap = topTags.map((tag) => {
    const url = `${baseUrl}/blog/tag/${encodeURIComponent(tag)}`;
    return {
      url,
      lastModified: latestContentDate,
      changeFrequency: 'daily',
      priority: 0.6,
      alternates: withAlternates(url),
    };
  });

  // 테마 상세(/themes/[id])는 TLI v3 마이그레이션 동안 noindex → sitemap에서 제외한다.
  // (noindex URL을 sitemap에 넣으면 "색인하라"는 신호와 모순되고 크롤 예산만 낭비.)
  // 테마가 색인 전환되면 이 위치에 themePages를 다시 추가한다.
  return [...staticPages, ...blogPages, ...tagPages];
}
