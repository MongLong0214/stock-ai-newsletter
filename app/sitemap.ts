import { MetadataRoute } from 'next';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { fetchAllRows } from '@/lib/supabase/paginate';
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
    return await fetchAllRows((from, to) =>
      supabase
        .from('blog_posts')
        .select('slug, published_at, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(from, to),
    );
  } catch (error) {
    console.error('[Sitemap] 발행 블로그 조회 실패', error);
    throw error;
  }
}

async function getTopBlogTags(): Promise<string[]> {
  try {
    const supabase = getServerSupabaseClient();
    const data = await fetchAllRows<{ tags: string[] | null }>((from, to) =>
      supabase
        .from('blog_posts')
        .select('tags')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .range(from, to),
    );

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
    { url: `${baseUrl}/privacy`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'yearly', priority: 0.3, alternates: withAlternates(`${baseUrl}/privacy`) },
    { url: `${baseUrl}/terms`, lastModified: STATIC_PAGE_UPDATED, changeFrequency: 'yearly', priority: 0.3, alternates: withAlternates(`${baseUrl}/terms`) },
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

  // 테마 상세(/themes/[id])는 TLI v3 마이그레이션 동안 색인 대상이 아니므로 sitemap에서 제외한다.
  //
  // 주의 — 현재 코드와 이 의도는 어긋나 있다. app/themes/[id]/page.tsx의 generateMetadata는
  // 존재하지 않는 테마(404 분기)에만 robots:{index:false}를 걸고, 실제 테마는 루트 layout의
  // index,follow를 그대로 상속해 self-canonical로 서빙된다. 즉 sitemap에만 없을 뿐 색인은
  // 가능한 상태다. 마이그레이션 중 색인을 실제로 막으려면 page.tsx 성공 경로에도
  // robots:{index:false}를 넣어야 한다(약 239개 페이지가 색인에서 빠지므로 별도 판단 필요).
  // 마이그레이션 종료 후 색인 전환 시에는 이 위치에 themePages를 추가한다.
  return [...staticPages, ...blogPages, ...tagPages];
}
