/**
 * 블로그 목록 페이지 (/blog)
 *
 * [이 파일의 역할]
 * - 발행된 블로그 포스트 목록 표시
 * - Schema.org 구조화 데이터 삽입 (SEO)
 * - 뉴스레터 구독 CTA 표시
 *
 * [Next.js App Router]
 * - page.tsx는 해당 경로의 메인 페이지 컴포넌트
 * - 이 파일은 /blog URL에 대응
 *
 * [데이터 페칭]
 * - 서버 컴포넌트에서 직접 Supabase 쿼리
 * - ISR(Incremental Static Regeneration) 적용
 * - 5분(300초)마다 페이지 재생성
 *
 * [ISR이란?]
 * - 정적 페이지를 주기적으로 재생성
 * - 빌드 타임에 생성 + 런타임에 갱신
 * - 성능과 최신성의 균형
 */

import Link from 'next/link';
import Script from 'next/script';
import { siteConfig } from '@/lib/constants/seo/config';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import BlogCard from './_components/blog-card';
import type { BlogPostListItem } from './_types/blog';

/**
 * 발행된 블로그 포스트 목록 조회
 *
 * [Supabase 쿼리]
 * - status가 'published'인 포스트만 조회
 * - 최신순(발행일 내림차순) 정렬
 * - 최대 20개 조회 (페이지네이션 없음)
 *
 * [조회 필드]
 * - slug, title, description: 카드 표시용
 * - target_keyword, category, tags: 분류 정보
 * - published_at, view_count: 메타 정보
 *
 * @returns 블로그 포스트 목록 배열 (에러 시 빈 배열)
 */
async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  // 서버 전용 Supabase 클라이언트
  const supabase = getServerSupabaseClient();

  // 발행된 포스트 조회
  const { data, error } = await supabase
    .from('blog_posts')
    // 필요한 필드만 선택 (content 제외로 성능 최적화)
    .select(
      'slug, title, description, target_keyword, category, tags, published_at, view_count'
    )
    // 발행된 포스트만
    .eq('status', 'published')
    // 최신순 정렬
    .order('published_at', { ascending: false })
    // 최대 20개
    .limit(20);

  // 에러 시 빈 배열 반환 (에러 페이지 대신 빈 목록 표시)
  if (error) {
    return [];
  }

  return data as BlogPostListItem[];
}

/**
 * 블로그 목록 페이지 컴포넌트
 *
 * [렌더링 구조]
 * 1. Schema.org 구조화 데이터 (SEO)
 * 2. 헤더 (홈 링크 + 구독 버튼)
 * 3. 페이지 타이틀
 * 4. 블로그 카드 그리드 (또는 빈 상태)
 * 5. CTA 섹션 (뉴스레터 구독)
 * 6. 푸터
 */
async function BlogPage() {
  // 서버에서 데이터 조회 (SSR)
  const posts = await getPublishedPosts();

  /**
   * CollectionPage Schema (Schema.org)
   *
   * [용도]
   * - 검색엔진에게 이 페이지가 콘텐츠 목록임을 알림
   * - Google 검색 결과에서 리치 스니펫 표시 가능
   *
   * [구조]
   * - CollectionPage: 목록 페이지 타입
   * - ItemList: 포함된 아이템 목록
   * - ListItem: 각 포스트 정보
   */
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    // 상위 사이트 정보
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    // 포스트 목록
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      // 각 포스트를 ListItem으로 변환
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1, // 1부터 시작
        url: `${siteConfig.domain}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };

  return (
    <>
      {/* Schema.org 구조화 데이터 삽입 */}
      {/* afterInteractive: 페이지 렌더링 후 로드 (성능 최적화) */}
      <Script
        id="blog-collection-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        strategy="afterInteractive"
      />

      <div className="min-h-screen bg-black text-white">
        {/* 헤더: 홈 링크 + 구독 버튼 */}
        <header className="border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
            {/* 홈 링크 (화살표 아이콘 + 텍스트) */}
            <Link
              href="/"
              className="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2"
            >
              {/* 왼쪽 화살표 SVG */}
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

            {/* 구독 버튼 */}
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
          {/* 페이지 타이틀 섹션 */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              {/* '블로그' 부분만 emerald 색상 */}
              주식 투자 <span className="text-emerald-400">블로그</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 <br className="hidden md:block" />
              주식 투자에 필요한 모든 정보를 제공합니다.
            </p>
          </div>

          {/* 블로그 목록 또는 빈 상태 */}
          {posts.length > 0 ? (
            // 포스트가 있는 경우: 카드 그리드
            // 반응형: 모바일 1열, 태블릿 2열, 데스크톱 3열
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post, index) => (
                <BlogCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          ) : (
            // 포스트가 없는 경우: 빈 상태 UI
            <div className="text-center py-20">
              {/* 이모지 아이콘 */}
              <div className="text-6xl mb-4">📝</div>
              <h2 className="text-xl font-semibold mb-2">
                아직 작성된 글이 없습니다
              </h2>
              <p className="text-gray-400 mb-6">
                곧 유용한 주식 투자 정보가 업로드될 예정입니다.
              </p>
              {/* 뉴스레터 구독 유도 */}
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-medium transition-colors"
              >
                뉴스레터 구독하기
                {/* 오른쪽 화살표 SVG */}
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

          {/* CTA 섹션: 뉴스레터 구독 유도 (포스트가 있을 때만 표시) */}
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
            {/* 현재 연도 동적 표시 */}
            <p>© {new Date().getFullYear()} Stock Matrix. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

export default BlogPage;

/**
 * ISR (Incremental Static Regeneration) 설정
 *
 * [동작 방식]
 * 1. 첫 요청 시 정적 페이지 생성 및 캐시
 * 2. 300초(5분) 내 요청: 캐시된 페이지 반환
 * 3. 300초 이후 요청: 백그라운드에서 페이지 재생성
 *    - 현재 요청은 캐시된 페이지 반환 (stale)
 *    - 다음 요청부터 새 페이지 반환
 *
 * [장점]
 * - 정적 페이지의 성능 + 동적 콘텐츠 갱신
 * - 새 포스트 발행 시 최대 5분 후 반영
 *
 * [주의]
 * - 실시간 업데이트가 필요하면 값을 줄이거나 0으로 설정
 * - 0 = 매 요청마다 재생성 (SSR과 동일)
 */
export const revalidate = 300;