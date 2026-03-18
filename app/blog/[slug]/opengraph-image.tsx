import { ImageResponse } from 'next/og';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { isValidBlogSlug } from '../_utils/slug-validator';
import { createOgLayout } from '@/lib/og-template';

export const runtime = 'edge';
export const alt = 'Stock Matrix 블로그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

async function getBlogPost(slug: string) {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, description, category, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) {
    return new Response('Not found', { status: 404 });
  }
  const post = await getBlogPost(slug);

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  const title = post.title.replace(/\.$/, '');
  const cleanTitle = title.length > 60 ? title.slice(0, 57) + '...' : title;
  const description =
    post.description.length > 100 ? post.description.slice(0, 97) + '...' : post.description;

  return new ImageResponse(
    createOgLayout({
      title: cleanTitle,
      subtitle: description,
      titleSize: cleanTitle.length > 30 ? 60 : 76,
      titleLineHeight: 1.25,
    }),
    { ...size }
  );
}
