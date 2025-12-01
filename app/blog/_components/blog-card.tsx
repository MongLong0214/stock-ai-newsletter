import Link from 'next/link';
import { formatDateKo } from '../_utils/date-formatter';
import type { BlogPostListItem } from '../_types/blog';

interface BlogCardProps {
  post: BlogPostListItem;
  index: number;
}

/**
 * 블로그 카드 컴포넌트
 */
function BlogCard({ post, index }: BlogCardProps) {
  return (
    <article
      className="group animate-fade-in-up"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="block p-6 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/70 hover:border-emerald-500/50 transition-all duration-300"
      >
        {/* 카테고리 & 날짜 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {post.category || '주식 뉴스레터'}
          </span>
          {post.published_at && (
            <span className="text-xs text-gray-500">
              {formatDateKo(post.published_at)}
            </span>
          )}
        </div>

        {/* 제목 */}
        <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors line-clamp-2">
          {post.title}
        </h2>

        {/* 설명 */}
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">
          {post.description}
        </p>

        {/* 태그 */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* 조회수 */}
        <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 flex items-center gap-1">
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

          <span className="text-xs text-emerald-400 group-hover:translate-x-1 transition-transform">
            읽기 →
          </span>
        </div>
      </Link>
    </article>
  );
}

export default BlogCard;