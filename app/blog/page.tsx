import Link from 'next/link';
import Script from 'next/script';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import BlogCard from './_components/blog-card';
import ArrowRightIcon from './_components/icons/arrow-right-icon';
import createCollectionPageSchema from './_utils/schema-generator-list';
import isValidBlogPost from './_utils/type-guards';
import type { BlogPostListItem } from './_types/blog';

async function getPublishedPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  // 디버깅: 전체 포스트 수 확인
  const { count: totalCount } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true });

  const { count: publishedCount } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');

  console.log(`[Blog] DB 전체 포스트: ${totalCount}개, published: ${publishedCount}개`);

  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      'slug, title, description, target_keyword, category, tags, published_at, view_count'
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[Blog] Failed to fetch posts:', error);
    return [];
  }

  console.log(`[Blog] 쿼리 결과: ${data?.length || 0}개`);

  if (!Array.isArray(data)) {
    console.error('[Blog] Invalid data format received');
    return [];
  }

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
 * - 새 블로그 포스트가 즉시 반영되도록 짧은 revalidate 시간 설정
 * - 0 = 매 요청마다 재검증 (개발/디버깅 시 유용)
 */
export const revalidate = 0; // 매 요청마다 재검증 (디버깅용)