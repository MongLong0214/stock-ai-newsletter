import type { Metadata } from 'next';
import Script from 'next/script';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import AnimatedBackground from '@/components/animated-background';
import BlogListClient from './_components/blog-list/blog-list-client';
import createCollectionPageSchema from './_utils/schema-generator-list';
import isValidBlogPost from './_utils/type-guards';
import type { BlogPostListItem } from './_types/blog';

async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  // 먼저 간단한 쿼리로 테스트
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  console.log('Query result:', { hasData: !!data, error, count: data?.length });

  if (error || !Array.isArray(data)) return [];

  return data.filter(isValidBlogPost);
}

async function BlogPage() {
  const posts = await getPublishedPosts();
  const collectionSchema = createCollectionPageSchema(posts);

  return (
    <>
      <Script
        id="blog-collection-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        strategy="afterInteractive"
      />

      {/* 배경 애니메이션 */}
      <AnimatedBackground />

      <main className="relative text-white min-h-screen">
        <section className="relative overflow-hidden pt-24 pb-12 px-6 sm:pt-28 sm:pb-16 md:pt-32 md:pb-20 lg:px-8">
          <div className="relative max-w-6xl mx-auto">
            <header className="text-center space-y-6 sm:space-y-8">
              <h1 className="text-4xl leading-[1.15] font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                <span className="block sm:inline">Stock Matrix</span>
                <span className="inline-block ml-2 sm:ml-3">
                  <span className="relative inline-block">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">
                      Blog
                    </span>
                    <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400/60 to-transparent rounded-full sm:-bottom-1 sm:h-1" />
                  </span>
                </span>
              </h1>

              <p className="text-base leading-relaxed text-gray-400 max-w-2xl mx-auto sm:text-lg md:text-xl md:leading-relaxed">
                AI 주식 분석, 뉴스레터 추천,
                <br />
                기술적 분석 가이드 등 주식 투자에
                <br className="sm:hidden" />
                필요한 모든 정보를 제공합니다.
              </p>
            </header>
          </div>
        </section>

        <section className="relative pb-16 px-6 sm:pb-20 md:pb-28 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <BlogListClient posts={posts} />
          </div>
        </section>
      </main>
    </>
  );
}


export default BlogPage;

export const metadata: Metadata = {
  title: 'AI 주식 분석 블로그 - Stock Matrix',
  description: 'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
  keywords: '주식 블로그, AI 주식 분석, 기술적 분석, 주식 투자, 뉴스레터 추천',
  openGraph: {
    title: 'AI 주식 분석 블로그 - Stock Matrix',
    description: 'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    siteName: siteConfig.serviceName,
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 주식 분석 블로그 - Stock Matrix',
    description: 'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
  },
  alternates: {
    canonical: `${siteConfig.domain}/blog`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const revalidate = 3600;