import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * 발행된 블로그 슬러그 목록 조회
 */
async function getPublishedBlogSlugs(): Promise<
  { slug: string; published_at: string }[]
> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data } = await supabase
      .from('blog_posts')
      .select('slug, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    return data || [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://stockmatrix.co.kr';
  const currentDate = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
      alternates: {
        languages: {
          ko: baseUrl,
        },
      },
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: {
        languages: {
          ko: `${baseUrl}/about`,
        },
      },
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: {
        languages: {
          ko: `${baseUrl}/faq`,
        },
      },
    },
    {
      url: `${baseUrl}/technical-indicators`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
      alternates: {
        languages: {
          ko: `${baseUrl}/technical-indicators`,
        },
      },
    },
    {
      url: `${baseUrl}/subscribe`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: {
        languages: {
          ko: `${baseUrl}/subscribe`,
        },
      },
    },
    {
      url: `${baseUrl}/archive`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: {
        languages: {
          ko: `${baseUrl}/archive`,
        },
      },
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: {
        languages: {
          ko: `${baseUrl}/blog`,
        },
      },
    },
    {
      url: `${baseUrl}/unsubscribe`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.2,
      alternates: {
        languages: {
          ko: `${baseUrl}/unsubscribe`,
        },
      },
    },
  ];

  // 블로그 포스트 동적 페이지
  const blogPosts = await getPublishedBlogSlugs();
  const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.published_at),
    changeFrequency: 'weekly',
    priority: 0.7,
    alternates: {
      languages: {
        ko: `${baseUrl}/blog/${post.slug}`,
      },
    },
  }));

  return [...staticPages, ...blogPages];
}