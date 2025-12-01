import Link from 'next/link';
import Script from 'next/script';
import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import BlogCard from './_components/blog-card';
import type { BlogPostListItem } from './_types/blog';

/**
 * 발행된 블로그 포스트 목록 조회
 */
async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      'slug, title, description, target_keyword, category, tags, published_at, view_count'
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }

  return data as BlogPostListItem[];
}

/**
 * 블로그 목록 페이지
 */
async function BlogPage() {
  const posts = await getPublishedPosts();

  // CollectionPage Schema
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteConfig.domain}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };

  return (
    <>
      {/* Schema.org */}
      <Script
        id="blog-collection-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        strategy="afterInteractive"
      />

      <div className="min-h-screen bg-black text-white">
        {/* 헤더 */}
        <header className="border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
            <Link
              href="/"
              className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Stock Matrix
            </Link>

            <Link
              href="/subscribe"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black transition-colors"
            >
              무료 구독
            </Link>
          </div>
        </header>

        {/* 메인 콘텐츠 */}
        <main className="max-w-6xl mx-auto px-4 py-12">
          {/* 페이지 타이틀 */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              주식 투자 <span className="text-emerald-400">블로그</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 <br className="hidden md:block" />
              주식 투자에 필요한 모든 정보를 제공합니다.
            </p>
          </div>

          {/* 블로그 목록 */}
          {posts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post, index) => (
                <BlogCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">📝</div>
              <h2 className="text-xl font-semibold mb-2">
                아직 작성된 글이 없습니다
              </h2>
              <p className="text-gray-400 mb-6">
                곧 유용한 주식 투자 정보가 업로드될 예정입니다.
              </p>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium transition-colors"
              >
                뉴스레터 구독하기
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </Link>
            </div>
          )}

          {/* CTA 섹션 */}
          {posts.length > 0 && (
            <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 text-center">
              <h2 className="text-2xl font-bold mb-3">
                매일 아침, AI가 분석한 주식 추천을 받아보세요
              </h2>
              <p className="text-gray-400 mb-6">
                30가지 기술적 지표로 분석한 KOSPI·KOSDAQ 종목을 <br className="hidden md:block" />
                매일 오전 7:50에 무료로 이메일 발송해드립니다.
              </p>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold transition-colors"
              >
                무료 구독하기
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </Link>
            </div>
          )}
        </main>

        {/* 푸터 */}
        <footer className="border-t border-gray-800 py-8">
          <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Stock Matrix. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default BlogPage;

// ISR: 5분마다 재생성
export const revalidate = 300;