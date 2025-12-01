import Link from 'next/link';
import Script from 'next/script';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import BlogCard from './_components/blog-card';
import ArrowRightIcon from './_components/icons/arrow-right-icon';
import createCollectionPageSchema from './_utils/schema-generator-list';
import isValidBlogPost from './_utils/type-guards';
import type { BlogPostListItem } from './_types/blog';

async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  try {
    const supabase = getServerSupabaseClient();

    console.log('[Blog] Fetching published posts...');

    const { data, error, count } = await supabase
      .from('blog_posts')
      .select(
        'slug, title, description, target_keyword, category, tags, published_at, view_count',
        { count: 'exact' }
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[Blog] Failed to fetch posts:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return [];
    }

    console.log(`[Blog] Query result: ${count ?? 0} posts found`);

    if (!Array.isArray(data)) {
      console.error('[Blog] Invalid data format received:', typeof data);
      return [];
    }

    const validPosts = data.filter(isValidBlogPost);
    console.log(
      `[Blog] Valid posts after filtering: ${validPosts.length}/${data.length}`
    );

    return validPosts;
  } catch (err) {
    console.error('[Blog] Exception in getPublishedPosts:', err);
    return [];
  }
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
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              주식 투자 <span className="text-emerald-400">블로그</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 <br className="hidden md:block" />
              주식 투자에 필요한 모든 정보를 제공합니다.
            </p>
          </div>

          {posts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post, index) => (
                <BlogCard key={post.slug} post={post} index={index} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
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
            </div>
          )}

          {posts.length > 0 && (
            <section
              className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 text-center"
              aria-labelledby="cta-heading"
            >
              <h2 id="cta-heading" className="text-2xl font-bold mb-3">
                매일 아침, AI가 분석한 주식 추천을 받아보세요
              </h2>
              <p className="text-gray-400 mb-6">
                30가지 기술적 지표로 분석한 KOSPI·KOSDAQ 종목을 <br className="hidden md:block" />
                매일 오전 7:50에 무료로 이메일 발송해드립니다.
              </p>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold transition-colors"
                aria-label="무료 뉴스레터 구독하기"
              >
                무료 구독하기
                <ArrowRightIcon />
              </Link>
            </section>
          )}
        </div>
      </main>
    </>
  );
}

export default BlogPage;

/**
 * ISR (Incremental Static Regeneration) 설정
 *
 * [블로그 목록 페이지 갱신 패턴]
 * - 하루 1회 새 블로그 추가 (평일 오전 9~12시)
 * - 목록은 변경이 적음 (제목, 설명 수정은 드묾)
 * - 1시간 revalidate = 새 블로그가 1시간 내 목록에 표시
 *
 * [비용 절감]
 * - 5분(300초): 하루 288회 재검증
 * - 1시간(3600초): 하루 24회 재검증 → 95% 비용 절감
 */
export const revalidate = 3600; // 1시간