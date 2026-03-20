import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ArrowLeft } from 'lucide-react';

import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig, withOgImageVersion } from '@/lib/constants/seo/config';
import AnimatedBackground from '@/components/animated-background';
import BlogListClient from '../../_components/blog-list/blog-list-client';
import isValidBlogPost from '../../_utils/type-guards';
import { isValidBlogSlug } from '../../_utils/slug-validator';
import type { BlogPostListItem } from '../../_types/blog';

interface PageProps {
  params: Promise<{ tag: string }>;
}

export const dynamic = 'force-dynamic';

const getPostsByTag = cache(async (tag: string): Promise<BlogPostListItem[]> => {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .contains('tags', [tag])
    .order('published_at', { ascending: false });

  if (error || !Array.isArray(data)) return [];

  return data.filter(isValidBlogPost).filter((post) => isValidBlogSlug(post.slug));
});

async function isValidTag(tag: string): Promise<boolean> {
  const posts = await getPostsByTag(tag);
  return posts.length > 0;
}

function createTagBreadcrumbSchema(tag: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stock Matrix', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '블로그', item: `${siteConfig.domain}/blog` },
      { '@type': 'ListItem', position: 3, name: tag, item: `${siteConfig.domain}/blog/tag/${encodeURIComponent(tag)}` },
    ],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  const valid = await isValidTag(decodedTag);
  if (!valid) {
    return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } };
  }

  const title = `${decodedTag} 관련 주식 분석 - Stock Matrix`;
  const description = `${decodedTag} 태그가 포함된 AI 주식 분석 블로그 글을 모아봤습니다. Stock Matrix에서 제공하는 ${decodedTag} 관련 인사이트를 확인하세요.`;
  const url = `${siteConfig.domain}/blog/tag/${encodeURIComponent(decodedTag)}`;

  return {
    title,
    description,
    keywords: [decodedTag, '주식 블로그', 'AI 주식 분석', '기술적 분석'],
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.serviceName,
      type: 'website',
      locale: 'ko_KR',
      images: [
        {
          url: withOgImageVersion(
            `${siteConfig.domain}/blog/tag/${encodeURIComponent(decodedTag)}/opengraph-image`
          ),
          width: 1200,
          height: 630,
          alt: `${decodedTag} - Stock Matrix`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [
        withOgImageVersion(
          `${siteConfig.domain}/blog/tag/${encodeURIComponent(decodedTag)}/opengraph-image`
        ),
      ],
    },
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

async function TagHubPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const posts = await getPostsByTag(decodedTag);

  // 태그에 해당하는 포스트가 없으면 404
  if (posts.length === 0) notFound();

  return (
    <>
      <script
        id="tag-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(createTagBreadcrumbSchema(decodedTag)).replace(/</g, '\\u003c') }}
      />

      <AnimatedBackground />

      <main className="relative text-white min-h-screen">
        {/* 브레드크럼 */}
        <div className="relative pt-20 pb-6 px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              블로그 목록
            </Link>
          </div>
        </div>

        {/* 헤더 */}
        <section className="relative overflow-hidden pb-12 px-6 sm:pb-16 md:pb-20 lg:px-8">
          <div className="relative max-w-6xl mx-auto">
            <header className="text-center space-y-6 sm:space-y-8">
              <h1
                className="text-4xl leading-[1.15] font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl animate-fade-in-up"
                style={{ animationDelay: '0ms' }}
              >
                #{decodedTag}
              </h1>
              <p
                className="max-w-2xl mx-auto text-lg text-slate-300 sm:text-xl animate-fade-in-up"
                style={{ animationDelay: '100ms' }}
              >
                {decodedTag} 태그가 포함된 블로그 글 {posts.length}개
              </p>
            </header>
          </div>
        </section>

        {/* 블로그 목록 */}
        <section className="relative pb-16 px-6 sm:pb-20 md:pb-28 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <BlogListClient posts={posts} />
          </div>
        </section>
      </main>
    </>
  );
}

export default TagHubPage;

export const revalidate = 3600;
