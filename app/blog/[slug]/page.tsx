/**
 * 블로그 상세 페이지 (/blog/[slug])
 * - 동적 메타데이터 생성 (SEO 최적화)
 * - Schema.org 구조화 데이터 삽입
 * - 목차(TOC), 읽기 진행도, FAQ 등 고급 UX 기능
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';

import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { parseMarkdown } from '../_utils/markdown-parser';
import { formatDateKo } from '../_utils/date-formatter';
import { createArticleSchema, createFAQSchema, createBreadcrumbSchema } from '../_utils/schema-generator';
import { isValidBlogSlug } from '../_utils/slug-validator';
import type { BlogPost } from '../_types/blog';

import { ReadingProgress } from './_components/reading-progress';
import { TableOfContents } from './_components/table-of-contents';
import { FAQAccordion } from './_components/faq-accordion';
import { CTASection } from './_components/cta-section';
import { SchemaScripts } from './_components/schema-scripts';
import { extractTOCItems } from '../_utils/toc-extractor';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** 블로그 포스트 조회 */
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

/** 관련 포스트 조회 (태그 기반) */
async function getRelatedPosts(currentSlug: string, tags: string[]) {
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

/** 동적 메타데이터 생성 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) {
    return { title: '페이지를 찾을 수 없습니다', robots: { index: false, follow: false } };
  }
  const post = await getBlogPost(slug);

  if (!post) return { title: '페이지를 찾을 수 없습니다' };

  const title = post.meta_title || post.title;
  const description = post.meta_description || post.description;
  const url = `${siteConfig.domain}/blog/${slug}`;
  const ogImageUrl = `${siteConfig.domain}/blog/${slug}/opengraph-image`;

  return {
    title,
    description,
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
    authors: [{ name: siteConfig.serviceName }],
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
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title, type: 'image/png' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
  };
}

/** 블로그 상세 페이지 컴포넌트 */
async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) notFound();
  const post = await getBlogPost(slug);

  if (!post) notFound();

  const [relatedPosts, htmlContent] = await Promise.all([
    getRelatedPosts(slug, post.tags || []),
    parseMarkdown(post.content),
  ]);

  const tocItems = extractTOCItems(htmlContent);

  /** Schema.org 구조화 데이터 생성 */
  const allSchemas = [
    { id: 'article-schema', data: createArticleSchema(post, slug) },
    { id: 'faq-schema', data: createFAQSchema(post.faq_items || []) },
    { id: 'breadcrumb-schema', data: createBreadcrumbSchema(post.title, slug) },
  ];
  const schemas = allSchemas.filter((s) => s.data) as Array<{ id: string; data: object }>;

  return (
    <>
      {/* Schema.org JSON-LD */}
      <SchemaScripts schemas={schemas} />

      {/* 읽기 진행도 바 */}
      <ReadingProgress />

      <div className="relative min-h-screen pt-20 pb-16">
        {/* 브레드크럼 네비게이션 */}
        <div className="max-w-7xl mx-auto px-5 md:px-6 lg:px-4 mb-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            블로그 목록
          </Link>
        </div>

        {/* 메인 레이아웃: 콘텐츠 + 목차 사이드바 */}
        <div className="max-w-7xl mx-auto px-5 md:px-6 lg:px-4">
          <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-16 xl:gap-20">
            {/* 메인 콘텐츠 */}
            <main>
              <article>
                {/* 글 헤더 */}
                <header className="mb-10">
                  <span className="inline-block px-3 py-1 mb-4 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Stock Matrix
                  </span>

                  <h1 className="text-3xl md:text-4xl lg:text-[2.5rem] font-bold mb-6 leading-tight text-white">
                    {post.title}
                  </h1>

                  {/* 메타 정보 */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400 mb-6">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDateKo(post.published_at)}
                    </span>
                  </div>

                  {/* 태그 */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/50">
                          <Tag className="w-3 h-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                {/* 모바일 목차 */}
                <div className="lg:hidden">
                  <TableOfContents items={tocItems} variant="mobile" />
                </div>

                {/* 글 본문 */}
                <div className="prose-article" dangerouslySetInnerHTML={{ __html: htmlContent }} />

                {/* FAQ 섹션 */}
                <FAQAccordion items={post.faq_items || []} />

                {/* CTA 섹션 */}
                <CTASection />

                {/* 관련 글 */}
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

            {/* 데스크톱 목차 사이드바 */}
            <aside className="hidden lg:block">
              <TableOfContents items={tocItems} variant="desktop" />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default BlogPostPage;

export const revalidate = 3600;

/** 빌드 시 정적 생성할 페이지 목록 */
export async function generateStaticParams() {
  const limit = Number(process.env.BLOG_STATIC_PAGES) || 50;

  try {
    const supabase = getServerSupabaseClient();
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[generateStaticParams] Database query failed:', error);
      return [];
    }

    return data?.map((post) => ({ slug: post.slug })) || [];
  } catch (error) {
    console.error('[generateStaticParams] Unexpected error:', error);
    return [];
  }
}
