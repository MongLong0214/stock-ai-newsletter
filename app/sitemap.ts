import { MetadataRoute } from 'next';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { isValidBlogSlug } from './blog/_utils/slug-validator';

async function getActiveThemeIds(): Promise<string[]> {
  try {
    const supabase = getServerSupabaseClient();
    const { data } = await supabase.from('themes').select('id').eq('is_active', true);
    return (data || []).map((t) => t.id);
  } catch {
    return [];
  }
}

async function getPublishedBlogSlugs(): Promise<{ slug: string; published_at: string }[]> {
  try {
    const supabase = getServerSupabaseClient();
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
  const baseUrl = 'https://stockmatrix.co.kr';
  const currentDate = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: currentDate, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/about`, lastModified: currentDate, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/faq`, lastModified: currentDate, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/technical-indicators`, lastModified: currentDate, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/subscribe`, lastModified: currentDate, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/archive`, lastModified: currentDate, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: currentDate, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/themes`, lastModified: currentDate, changeFrequency: 'daily', priority: 0.9 },
  ];

  const [blogPosts, topTags, themeIds] = await Promise.all([
    getPublishedBlogSlugs(),
    getTopBlogTags(),
    getActiveThemeIds(),
  ]);

  const blogPages: MetadataRoute.Sitemap = blogPosts
    .filter((post) => isValidBlogSlug(post.slug))
    .map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.published_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  const tagPages: MetadataRoute.Sitemap = topTags.map((tag) => ({
    url: `${baseUrl}/blog/tag/${encodeURIComponent(tag)}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const themePages: MetadataRoute.Sitemap = themeIds.map((id) => ({
    url: `${baseUrl}/themes/${id}`,
    lastModified: currentDate,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticPages, ...blogPages, ...tagPages, ...themePages];
}
