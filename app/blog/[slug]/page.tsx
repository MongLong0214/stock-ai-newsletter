import { notFound } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { parseMarkdown } from '../_utils/markdown-parser';
import { formatDateKo, calculateReadTime } from '../_utils/date-formatter';
import type { BlogPost, FAQItem } from '../_types/blog';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * 블로그 포스트 조회
 */
async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    return null;
  }

  return data as BlogPost;
}

/**
 * 관련 포스트 조회
 */
async function getRelatedPosts(
  currentSlug: string,
  tags: string[]
): Promise<{ slug: string; title: string }[]> {
  const supabase = getServerSupabaseClient();

  const { data } = await supabase
    .from('blog_posts')
    .select('slug, title')
    .eq('status', 'published')
    .neq('slug', currentSlug)
    .overlaps('tags', tags)
    .limit(3);

  return data || [];
}

/**
 * 동적 메타데이터 생성
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: '페이지를 찾을 수 없습니다',
    };
  }

  return {
    title: post.meta_title || post.title,
    description: post.meta_description || post.description,
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
    openGraph: {
      title: post.meta_title || post.title,
      description: post.meta_description || post.description,
      url: `${siteConfig.domain}/blog/${slug}`,
      siteName: siteConfig.serviceName,
      type: 'article',
      locale: 'ko_KR',
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at,
      authors: [siteConfig.serviceName],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.meta_title || post.title,
      description: post.meta_description || post.description,
    },
    alternates: {
      canonical: `${siteConfig.domain}/blog/${slug}`,
    },
  };
}


/**
 * 블로그 상세 페이지
 */
async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = await getRelatedPosts(slug, post.tags || []);
  const readTime = calculateReadTime(post.content);

  // Article Schema
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.domain}/logo.png`,
      },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.domain}/blog/${slug}`,
    },
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };

  // FAQ Schema
  const faqSchema =
    post.faq_items && post.faq_items.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: post.faq_items.map((faq: FAQItem) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }
      : null;

  // BreadcrumbList Schema
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Stock Matrix',
        item: siteConfig.domain,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '블로그',
        item: `${siteConfig.domain}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${siteConfig.domain}/blog/${slug}`,
      },
    ],
  };

  return (
    <>
      {/* Schema.org */}
      <Script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        strategy="afterInteractive"
      />
      {faqSchema && (
        <Script
          id="faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
          strategy="afterInteractive"
        />
      )}
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        strategy="afterInteractive"
      />

      <div className="min-h-screen bg-black text-white">
        {/* 헤더 */}
        <header className="border-b border-gray-800 sticky top-0 bg-black/80 backdrop-blur-sm z-50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link
              href="/blog"
              className="text-gray-400 hover:text-emerald-400 transition-colors flex items-center gap-2 text-sm"
            >
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              블로그 목록
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
        <main className="max-w-4xl mx-auto px-4 py-12">
          {/* 아티클 헤더 */}
          <article>
            <header className="mb-8">
              {/* 카테고리 */}
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {post.category || '주식 뉴스레터'}
                </span>
              </div>

              {/* 제목 */}
              <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
                {post.title}
              </h1>

              {/* 메타 정보 */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span>{formatDateKo(post.published_at)}</span>
                <span>·</span>
                <span>{readTime}분 읽기</span>
                <span>·</span>
                <span className="flex items-center gap-1">
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
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  {post.view_count.toLocaleString()}
                </span>
              </div>
            </header>

            {/* 본문 */}
            <div
              className="prose prose-invert prose-emerald max-w-none
                prose-headings:font-bold prose-headings:text-white
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-gray-300 prose-p:leading-relaxed
                prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-white prose-strong:font-semibold
                prose-ul:text-gray-300 prose-ol:text-gray-300
                prose-li:marker:text-emerald-500
                prose-blockquote:border-emerald-500 prose-blockquote:text-gray-400
                prose-code:text-emerald-300 prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-800
                prose-table:border-collapse prose-table:border prose-table:border-gray-700
                prose-th:bg-gray-800 prose-th:text-white prose-th:p-3
                prose-td:border prose-td:border-gray-700 prose-td:p-3"
              dangerouslySetInnerHTML={{ __html: await parseMarkdown(post.content) }}
            />

            {/* 태그 */}
            {post.tags && post.tags.length > 0 && (
              <div className="mt-10 pt-6 border-t border-gray-800">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-sm text-gray-400 bg-gray-800 px-3 py-1 rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* 관련 포스트 */}
          {relatedPosts.length > 0 && (
            <section className="mt-16">
              <h2 className="text-xl font-bold mb-6">관련 글</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {relatedPosts.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    className="p-4 rounded-lg border border-gray-800 hover:border-emerald-500/50 hover:bg-gray-900/50 transition-all"
                  >
                    <h3 className="font-medium text-white line-clamp-2">
                      {related.title}
                    </h3>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CTA 섹션 */}
          <section className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 text-center">
            <h2 className="text-2xl font-bold mb-3">
              매일 아침 AI 주식 분석을 받아보세요
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
          </section>
        </main>

        {/* 푸터 */}
        <footer className="border-t border-gray-800 py-8 mt-16">
          <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
            <p>© {new Date().getFullYear()} Stock Matrix. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default BlogPostPage;

// ISR: 5분마다 재생성
export const revalidate = 300;