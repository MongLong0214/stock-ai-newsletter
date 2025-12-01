/**
 * 블로그 상세 페이지 (/blog/[slug])
 *
 * [이 파일의 역할]
 * - 개별 블로그 포스트 상세 내용 표시
 * - 동적 메타데이터 생성 (SEO)
 * - Schema.org 구조화 데이터 삽입
 * - 관련 포스트 표시
 *
 * [Next.js 동적 라우팅]
 * - [slug] 폴더는 동적 세그먼트를 의미
 * - /blog/best-stock-newsletter → slug = 'best-stock-newsletter'
 * - params.slug로 URL 파라미터 접근
 *
 * [데이터 페칭]
 * - 서버 컴포넌트에서 직접 Supabase 쿼리
 * - ISR 적용 (5분마다 재생성)
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import type { Metadata } from 'next';
// lucide-react: 아이콘 라이브러리
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { parseMarkdown } from '../_utils/markdown-parser';
import { formatDateKo, calculateReadTime } from '../_utils/date-formatter';
import { createArticleSchema, createFAQSchema, createBreadcrumbSchema } from '../_utils/schema-generator';
import type { BlogPost } from '../_types/blog';

/**
 * 페이지 Props 타입
 *
 * [Next.js 15+ 변경사항]
 * - params가 Promise로 변경됨
 * - await params로 접근해야 함
 */
interface PageProps {
  /** URL 파라미터 (Promise) */
  params: Promise<{ slug: string }>;
}

/**
 * 블로그 포스트 조회
 *
 * [조건]
 * - 해당 slug의 포스트
 * - status가 'published'인 포스트만
 *
 * @param slug - URL 슬러그
 * @returns 블로그 포스트 또는 null (없거나 비공개)
 */
async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('*') // 모든 필드 조회 (상세 페이지용)
    .eq('slug', slug)
    .eq('status', 'published') // 발행된 포스트만
    .single(); // 단일 결과 반환

  // 에러 또는 데이터 없음 → null
  return error || !data ? null : (data as BlogPost);
}

/**
 * 관련 포스트 조회
 *
 * [조건]
 * - 같은 태그를 가진 포스트
 * - 현재 포스트 제외
 * - 최대 3개
 *
 * [overlaps 연산자]
 * - PostgreSQL 배열 연산자
 * - 두 배열에 공통 요소가 있으면 true
 *
 * @param currentSlug - 현재 포스트 슬러그 (제외용)
 * @param tags - 현재 포스트의 태그 배열
 * @returns 관련 포스트 배열 (slug, title만)
 */
async function getRelatedPosts(currentSlug: string, tags: string[]): Promise<{ slug: string; title: string }[]> {
  const supabase = getServerSupabaseClient();

  const { data } = await supabase
    .from('blog_posts')
    .select('slug, title') // 필요한 필드만
    .eq('status', 'published')
    .neq('slug', currentSlug) // 현재 포스트 제외
    .overlaps('tags', tags) // 태그 겹치는 포스트
    .limit(3);

  return data || [];
}

/**
 * 동적 메타데이터 생성
 *
 * [Next.js generateMetadata]
 * - 서버에서 메타데이터를 동적으로 생성
 * - params에 접근하여 포스트별 메타데이터 생성
 * - layout.tsx의 기본 메타데이터를 오버라이드
 *
 * [반환 항목]
 * - title: 브라우저 탭 제목
 * - description: 검색 결과 설명
 * - keywords: SEO 키워드
 * - openGraph: 소셜 공유 정보
 * - twitter: 트위터 카드
 * - alternates.canonical: 정규 URL
 *
 * @param params - URL 파라미터
 * @returns 메타데이터 객체
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Next.js 15+: params가 Promise
  const { slug } = await params;
  const post = await getBlogPost(slug);

  // 포스트가 없으면 기본 메타데이터
  if (!post) return { title: '페이지를 찾을 수 없습니다' };

  // 메타 제목/설명 (없으면 일반 제목/설명 사용)
  const title = post.meta_title || post.title;
  const description = post.meta_description || post.description;
  const url = `${siteConfig.domain}/blog/${slug}`;

  return {
    title,
    description,
    // 키워드: 타겟 키워드 + 보조 키워드
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
    // Open Graph (Facebook, LinkedIn 등)
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.serviceName,
      type: 'article', // 블로그 글은 article 타입
      locale: 'ko_KR',
      publishedTime: post.published_at || undefined, // 발행일
      modifiedTime: post.updated_at, // 수정일
      authors: [siteConfig.serviceName],
    },
    // Twitter 카드
    twitter: { card: 'summary_large_image', title, description },
    // 정규 URL
    alternates: { canonical: url },
  };
}

/**
 * 블로그 상세 페이지 컴포넌트
 *
 * [렌더링 구조]
 * 1. Schema.org 스크립트 (Article, FAQ, Breadcrumb)
 * 2. 브레드크럼 네비게이션
 * 3. 아티클 헤더 (카테고리, 제목, 메타 정보)
 * 4. 본문 (Markdown → HTML 변환)
 * 5. 태그 목록
 * 6. 관련 포스트
 * 7. CTA 섹션 (뉴스레터 구독)
 */
async function BlogPostPage({ params }: PageProps) {
  // URL 파라미터 추출
  const { slug } = await params;
  // 포스트 조회
  const post = await getBlogPost(slug);

  // 포스트가 없으면 404 페이지
  if (!post) notFound();

  // 병렬로 데이터 처리 (성능 최적화)
  const [relatedPosts, htmlContent] = await Promise.all([
    // 관련 포스트 조회
    getRelatedPosts(slug, post.tags || []),
    // Markdown → HTML 변환
    parseMarkdown(post.content),
  ]);

  // 읽기 시간 계산 (분 단위)
  const readTime = calculateReadTime(post.content);

  // Schema.org 구조화 데이터 생성
  const articleSchema = createArticleSchema(post, slug); // Article Schema
  const faqSchema = createFAQSchema(post.faq_items || []); // FAQ Schema (있는 경우만)
  const breadcrumbSchema = createBreadcrumbSchema(post.title, slug); // Breadcrumb Schema

  return (
    <>
      {/* Article Schema: 블로그 글 정보 */}
      <Script id="article-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(articleSchema)}
      </Script>

      {/* FAQ Schema: 자주 묻는 질문 (있는 경우만) */}
      {faqSchema && (
        <Script id="faq-schema" type="application/ld+json" strategy="afterInteractive">
          {JSON.stringify(faqSchema)}
        </Script>
      )}

      {/* Breadcrumb Schema: 페이지 경로 */}
      <Script id="breadcrumb-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(breadcrumbSchema)}
      </Script>

      <div className="min-h-screen pt-20 pb-16">
        {/* 브레드크럼 네비게이션: 블로그 목록으로 돌아가기 */}
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-emerald-400 transition-colors"
          >
            {/* ArrowLeft: lucide-react 아이콘 */}
            <ArrowLeft className="w-4 h-4" />
            블로그 목록
          </Link>
        </div>

        <main className="max-w-4xl mx-auto px-4">
          <article>
            {/* 아티클 헤더 */}
            <header className="mb-8">
              {/* 카테고리 뱃지 */}
              <span className="inline-block px-3 py-1 mb-4 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {post.category || '주식 뉴스레터'}
              </span>

              {/* 제목 */}
              <h1 className="text-3xl md:text-4xl font-bold mb-4 leading-tight text-white">{post.title}</h1>

              {/* 메타 정보: 발행일 · 읽기 시간 · 조회수 */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                {/* 발행일 */}
                <span>{formatDateKo(post.published_at)}</span>
                <span className="text-slate-600">·</span>
                {/* 읽기 시간 */}
                <span>{readTime}분 읽기</span>
                <span className="text-slate-600">·</span>
                {/* 조회수 (Eye 아이콘) */}
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {post.view_count.toLocaleString()}
                </span>
              </div>
            </header>

            {/* 본문 (Markdown → HTML 렌더링) */}
            {/* dangerouslySetInnerHTML: HTML 문자열을 직접 렌더링 */}
            {/* XSS 방지: parseMarkdown에서 sanitize 적용됨 */}
            <div
              className="prose prose-invert prose-emerald max-w-none
                prose-headings:font-bold prose-headings:text-white
                prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-slate-300 prose-p:leading-relaxed
                prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-white prose-strong:font-semibold
                prose-ul:text-slate-300 prose-ol:text-slate-300
                prose-li:marker:text-emerald-500
                prose-blockquote:border-emerald-500 prose-blockquote:text-slate-400
                prose-code:text-emerald-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800
                prose-table:border-collapse prose-table:border prose-table:border-slate-700
                prose-th:bg-slate-800 prose-th:text-white prose-th:p-3
                prose-td:border prose-td:border-slate-700 prose-td:p-3"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />

            {/* 태그 목록 (있는 경우만) */}
            {post.tags && post.tags.length > 0 && (
              <div className="mt-10 pt-6 border-t border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span key={tag} className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* 관련 포스트 섹션 (있는 경우만) */}
          {relatedPosts.length > 0 && (
            <section className="mt-16">
              <h2 className="text-xl font-bold mb-6 text-white">관련 글</h2>
              {/* 반응형: 모바일 1열, 데스크톱 3열 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {relatedPosts.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    className="p-4 rounded-lg border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/50 transition-all"
                  >
                    {/* line-clamp-2: 최대 2줄 */}
                    <h3 className="font-medium text-white line-clamp-2">{related.title}</h3>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* CTA 섹션: 뉴스레터 구독 유도 */}
          <section className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 text-center">
            <h2 className="text-2xl font-bold mb-3 text-white">매일 아침 AI 주식 분석을 받아보세요</h2>
            <p className="text-slate-400 mb-6">
              30가지 기술적 지표로 분석한 KOSPI/KOSDAQ 종목을
              <br className="hidden md:block" />
              매일 오전 7:50에 무료로 이메일 발송해드립니다.
            </p>
            <Link
              href="/subscribe"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold transition-colors"
            >
              무료 구독하기
              {/* ArrowRight: lucide-react 아이콘 */}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </section>
        </main>
      </div>
    </>
  );
}

export default BlogPostPage;

/**
 * ISR (Incremental Static Regeneration) 설정
 *
 * [블로그 갱신 패턴]
 * - 하루 1회 발행 (평일 오전 9~12시)
 * - 긴급 수정은 드물게 발생
 * - 1시간 revalidate = 비용 효율적 + 충분히 빠른 반영
 *
 * [비용 절감]
 * - 5분(300초): 하루 288회 재검증 → 높은 비용
 * - 1시간(3600초): 하루 24회 재검증 → 95% 비용 절감
 *
 * [사용자 경험]
 * - 오전 10시 발행 → 늦어도 11시 반영 (충분함)
 * - 캐시된 페이지는 여전히 초고속 (~50ms)
 *
 * [긴급 수정 필요 시]
 * - On-Demand Revalidation API 사용 권장
 * - 또는 1시간 내 자동 반영 대기
 */
export const revalidate = 3600; // 1시간