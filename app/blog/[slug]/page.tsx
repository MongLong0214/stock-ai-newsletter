/**
 * 블로그 상세 페이지 (/blog/[slug])
 *
 * [이 파일의 역할]
 * - 개별 블로그 포스트 상세 내용 표시
 * - 동적 메타데이터 생성 (SEO)
 * - Schema.org 구조화 데이터 삽입
 * - 목차, 읽기 진행도, FAQ 등 고급 UX 기능
 *
 * [Next.js 동적 라우팅]
 * - [slug] 폴더는 동적 세그먼트를 의미
 * - /blog/best-stock-newsletter → slug = 'best-stock-newsletter'
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import type { Metadata } from 'next';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';

import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { parseMarkdown } from '../_utils/markdown-parser';
import { formatDateKo } from '../_utils/date-formatter';
import { createArticleSchema, createFAQSchema, createBreadcrumbSchema } from '../_utils/schema-generator';
import type { BlogPost } from '../_types/blog';

import {
  ReadingProgress,
  TableOfContents,
  FAQAccordion,
  CTASection,
} from './_components';
import { extractTOCItems } from '../_utils/toc-extractor';

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

  return error || !data ? null : (data as BlogPost);
}

/**
 * 관련 포스트 조회
 */
async function getRelatedPosts(currentSlug: string, tags: string[]): Promise<{ slug: string; title: string }[]> {
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

  if (!post) return { title: '페이지를 찾을 수 없습니다' };

  const title = post.meta_title || post.title;
  const description = post.meta_description || post.description;
  const url = `${siteConfig.domain}/blog/${slug}`;

  return {
    title,
    description,
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.serviceName,
      type: 'article',
      locale: 'ko_KR',
      publishedTime: post.published_at || undefined,
      modifiedTime: post.updated_at,
      authors: [siteConfig.serviceName],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: url },
  };
}

/**
 * 블로그 상세 페이지 컴포넌트
 */
async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) notFound();

  const [relatedPosts, htmlContent] = await Promise.all([
    getRelatedPosts(slug, post.tags || []),
    parseMarkdown(post.content),
  ]);

  // TOC 아이템 추출
  const tocItems = extractTOCItems(htmlContent);

  // Schema.org
  const articleSchema = createArticleSchema(post, slug);
  const faqSchema = createFAQSchema(post.faq_items || []);
  const breadcrumbSchema = createBreadcrumbSchema(post.title, slug);

  return (
    <>
      {/* Schema.org */}
      <Script id="article-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(articleSchema)}
      </Script>
      {faqSchema && (
        <Script id="faq-schema" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(faqSchema)}
        </Script>
      )}
      <Script id="breadcrumb-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(breadcrumbSchema)}
      </Script>

      {/* Reading Progress Bar */}
      <ReadingProgress />

      <div className="min-h-screen pt-20 pb-16">
        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto px-4 mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            블로그 목록
          </Link>
        </div>

        {/* Main Layout: Content + TOC Sidebar */}
        <div className="max-w-7xl mx-auto px-4">
          <div className="lg:grid lg:grid-cols-[1fr_240px] lg:gap-12">
            {/* Main Content */}
            <main>
              <article>
                {/* Article Header */}
                <header className="mb-10">
                  {/* Category Badge */}
                  <span className="inline-block px-3 py-1 mb-4 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {post.category || '주식 뉴스레터'}
                  </span>

                  {/* Title */}
                  <h1 className="text-3xl md:text-4xl lg:text-[2.5rem] font-bold mb-6 leading-tight text-white">
                    {post.title}
                  </h1>

                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400 mb-6">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDateKo(post.published_at)}
                    </span>
                  </div>

                  {/* Tags (눈에 띄게 배치) */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/50"
                        >
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                {/* Mobile TOC */}
                <TableOfContents items={tocItems} />

                {/* Article Content */}
                <div
                  className="mt-10 prose prose-invert prose-emerald max-w-none
                    prose-headings:font-bold prose-headings:text-white prose-headings:scroll-mt-24
                    prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-5 prose-h2:pb-3 prose-h2:border-b prose-h2:border-slate-800/50
                    prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4
                    prose-p:text-slate-300 prose-p:leading-[1.8] prose-p:mb-5
                    prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-white prose-strong:font-semibold
                    prose-ul:text-slate-300 prose-ol:text-slate-300 prose-ul:my-5 prose-ol:my-5
                    prose-li:marker:text-emerald-500 prose-li:mb-2
                    prose-blockquote:border-emerald-500 prose-blockquote:text-slate-400 prose-blockquote:bg-slate-900/30 prose-blockquote:py-1 prose-blockquote:rounded-r-lg
                    prose-code:text-emerald-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                    prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-lg
                    prose-table:border-collapse
                    prose-th:bg-slate-800 prose-th:text-white prose-th:p-3 prose-th:text-left prose-th:border prose-th:border-slate-700
                    prose-td:border prose-td:border-slate-700 prose-td:p-3
                    prose-hr:border-slate-800"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />

                {/* FAQ Section */}
                <FAQAccordion items={post.faq_items || []} />

                {/* CTA Section */}
                <CTASection />

                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                  <section className="mt-16 pt-10 border-t border-slate-800">
                    <h2 className="text-xl font-bold mb-6 text-white">관련 글</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {relatedPosts.map((related) => (
                        <Link
                          key={related.slug}
                          href={`/blog/${related.slug}`}
                          className="group p-5 rounded-xl border border-slate-800 hover:border-emerald-500/40 bg-slate-900/30 hover:bg-slate-900/60 transition-all"
                        >
                          <h3 className="font-medium text-white group-hover:text-emerald-400 line-clamp-2 transition-colors">
                            {related.title}
                          </h3>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            </main>

            {/* Desktop TOC Sidebar */}
            <TableOfContents items={tocItems} />
          </div>
        </div>
      </div>
    </>
  );
}

export default BlogPostPage;

/**
 * ISR 설정 (1시간)
 */
export const revalidate = 3600;