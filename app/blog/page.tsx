import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { siteConfig } from '@/lib/constants/seo/config';
import BlogCard from './_components/blog-card';
import ArrowRightIcon from './_components/icons/arrow-right-icon';
import createCollectionPageSchema from './_utils/schema-generator-list';
import isValidBlogPost from './_utils/type-guards';
import type { BlogPostListItem } from './_types/blog';

async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  console.log(data)
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

      <main className="bg-black text-white pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <header className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              주식 투자 <span className="text-emerald-400">블로그</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 <br className="hidden md:block" />
              주식 투자에 필요한 모든 정보를 제공합니다.
            </p>
          </header>

          {posts.length > 0 ? (
            <section aria-label="블로그 글 목록">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {posts.map((post, index) => (
                  <BlogCard key={post.slug} post={post} index={index} />
                ))}
              </div>
            </section>
          ) : (
            <section aria-label="빈 블로그 목록" className="text-center py-20">
              <div className="text-6xl mb-4" role="img" aria-label="문서 아이콘">
                📝
              </div>
              <h2 className="text-xl font-semibold mb-2">
                아직 작성된 글이 없습니다
              </h2>
              <p className="text-gray-400 mb-6">
                곧 유용한 주식 투자 정보가 업로드될 예정입니다.
              </p>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium transition-colors"
                aria-label="뉴스레터 구독하기"
              >
                뉴스레터 구독하기
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </section>
          )}


        </div>
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