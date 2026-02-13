import Link from 'next/link';
import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { cn } from '@/lib/utils';
import { formatDateKo } from '@/app/blog/_utils/date-formatter';
import type { BlogPostListItem } from '@/app/blog/_types/blog';

const MAX_POSTS = 8;
const MAX_VISIBLE_TAGS = 3;

async function getLatestPosts(): Promise<BlogPostListItem[]> {
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, target_keyword, category, tags, published_at, view_count')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(MAX_POSTS);

  if (error || !Array.isArray(data)) return [];

  return data;
}

export default async function LatestBlogSection() {
  const posts = await getLatestPosts();

  if (posts.length === 0) return null;

  return (
    <section className="relative py-24 px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* 섹션 헤더 */}
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">
              최신 블로그
            </span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            주식 투자에 필요한 AI 분석, 기술적 지표, 투자 전략을 확인하세요
          </p>
        </div>

        {/* 블로그 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
          {posts.map((post) => (
            <article key={post.slug} className="group h-full">
              <Link
                href={`/blog/${post.slug}`}
                className={cn(
                  'flex flex-col h-full p-6 rounded-xl',
                  'border border-slate-800/50 bg-slate-900/80',
                  'transition-[border-color,box-shadow] duration-200',
                  'hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50'
                )}
              >
                {/* 날짜 배지 */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    Blog
                  </span>

                  {post.published_at && (
                    <time
                      dateTime={post.published_at}
                      className="text-[10px] font-medium text-slate-500 group-hover:text-slate-400 transition-colors"
                    >
                      {formatDateKo(post.published_at)}
                    </time>
                  )}
                </div>

                {/* 제목 */}
                <h3 className="mb-3 text-lg font-bold text-white line-clamp-2 leading-snug group-hover:text-emerald-300 transition-colors">
                  {post.title}
                </h3>

                {/* 설명 */}
                <p className="mb-4 text-sm text-slate-400 line-clamp-2 leading-relaxed group-hover:text-slate-300 transition-colors">
                  {post.description}
                </p>

                {/* 태그 */}
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-auto pt-3 border-t border-slate-800/50">
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 text-[9px] font-medium text-slate-500 bg-slate-800/50 rounded border border-slate-700/40 group-hover:text-emerald-400 group-hover:border-emerald-500/20 transition-colors"
                        >
                          <span className="mr-0.5 text-slate-600 group-hover:text-emerald-400/60">#</span>
                          {tag}
                        </span>
                      ))}
                      {post.tags.length > MAX_VISIBLE_TAGS && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-medium text-slate-600 bg-slate-800/30 rounded border border-slate-700/30">
                          +{post.tags.length - MAX_VISIBLE_TAGS}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </Link>
            </article>
          ))}
        </div>

        {/* 전체보기 링크 */}
        <div className="text-center">
          <Link
            href="/blog"
            className={cn(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg',
              'border border-emerald-500/30 bg-emerald-500/10',
              'text-emerald-400 font-semibold text-sm',
              'hover:bg-emerald-500/20 hover:border-emerald-500/50',
              'transition-[background-color,border-color] duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50'
            )}
          >
            블로그 더보기
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
