import type { Metadata } from 'next';
import Script from 'next/script';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import AnimatedBackground from '@/components/animated-background';
import BlogListClient from './_components/blog-list/blog-list-client';
import createCollectionPageSchema from './_utils/schema-generator-list';
import isValidBlogPost from './_utils/type-guards';
import type { BlogPostListItem } from './_types/blog';

/**
 * 발행된 블로그 포스트 목록 조회
 * 서버 컴포넌트에서 데이터 페칭만 담당
 */
async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

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
        {/* 히어로 섹션 */}
        <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-20">

          <div className="relative max-w-6xl mx-auto px-4">
            {/* 헤더 */}
            <header className="text-center mb-12 md:mb-16">
              {/* 배지 */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-sm font-medium text-emerald-400">
                  AI 기반 주식 분석 인사이트
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
                주식 투자{' '}
                <span className="relative">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">
                    블로그
                  </span>
                  <span className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400/50 to-transparent rounded-full" />
                </span>
              </h1>

              <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
                AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등
                <br className="hidden md:block" />
                주식 투자에 필요한 모든 정보를 제공합니다.
              </p>
            </header>


          </div>
        </section>

        {/* 블로그 목록 섹션 */}
        <section className="relative pb-20 md:pb-28">
          <div className="max-w-6xl mx-auto px-4">
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