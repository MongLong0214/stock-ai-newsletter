import { MetadataRoute } from 'next';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import { isValidBlogSlug } from './blog/_utils/slug-validator';

/** 언어 alternates (단일언어 사이트용 x-default + ko) */
function withAlternates(url: string) {
  return {
    languages: {
      'ko': url,
      'x-default': url,
    },
  };
}

async function getActiveThemes(): Promise<{ id: string; calculated_at: string | null }[]> {
  try {
    const supabase = getServerSupabaseClient();

    const [{ data: activeThemes }, { data: scores }] = await Promise.all([
      supabase.from('themes').select('id').eq('is_active', true),
      supabase
        .from('lifecycle_scores')
        .select('theme_id, calculated_at')
        .order('calculated_at', { ascending: false }),
    ]);

    if (!activeThemes) return [];

    const latestScoreByTheme = new Map<string, string | null>();
    for (const row of scores || []) {
      if (!latestScoreByTheme.has(row.theme_id)) {
        latestScoreByTheme.set(row.theme_id, row.calculated_at);
      }
    }

    return activeThemes.map((t) => ({
      id: t.id,
      calculated_at: latestScoreByTheme.get(t.id) || null,
    }));
  } catch {
    return [];
  }
}

async function getPublishedBlogSlugs(): Promise<{ slug: string; published_at: string; updated_at: string | null }[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    return data || [];
  } catch {
    return [];
  }
}

async function getTopBlogTags(): Promise<string[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase.from('blog_posts').select('tags').eq('status', 'published');

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

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0, alternates: withAlternates(baseUrl) },
    { url: `${baseUrl}/about`, lastModified: new Date('2025-12-01'), changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/about`) },
    { url: `${baseUrl}/faq`, lastModified: new Date('2025-12-01'), changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/faq`) },
    { url: `${baseUrl}/technical-indicators`, lastModified: new Date('2025-12-01'), changeFrequency: 'monthly', priority: 0.9, alternates: withAlternates(`${baseUrl}/technical-indicators`) },
    { url: `${baseUrl}/subscribe`, lastModified: new Date('2025-12-01'), changeFrequency: 'weekly', priority: 0.9, alternates: withAlternates(`${baseUrl}/subscribe`) },
    { url: `${baseUrl}/archive`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/archive`) },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/blog`) },
    { url: `${baseUrl}/themes`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9, alternates: withAlternates(`${baseUrl}/themes`) },
    { url: `${baseUrl}/themes/methodology`, lastModified: new Date('2025-12-01'), changeFrequency: 'monthly', priority: 0.8, alternates: withAlternates(`${baseUrl}/themes/methodology`) },
    { url: `${baseUrl}/developers`, lastModified: new Date('2025-12-01'), changeFrequency: 'monthly', priority: 0.6, alternates: withAlternates(`${baseUrl}/developers`) },
  ];

  const [blogPosts, topTags, themes] = await Promise.all([
    getPublishedBlogSlugs(),
    getTopBlogTags(),
    getActiveThemes(),
  ]);

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
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.6,
      alternates: withAlternates(url),
    };
  });

  const themePages: MetadataRoute.Sitemap = themes.map((t) => {
    const url = `${baseUrl}/themes/${t.id}`;
    return {
      url,
      lastModified: t.calculated_at ? new Date(t.calculated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: withAlternates(url),
    };
  });

  return [...staticPages, ...blogPages, ...tagPages, ...themePages];
}