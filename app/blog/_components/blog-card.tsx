import Link from 'next/link';
import { formatDateKo } from '../_utils/date-formatter';
import type { BlogPostListItem } from '../_types/blog';

interface BlogCardProps {
  post: BlogPostListItem;
  index: number;
}

/**
 * 블로그 포스트 카드
 * 순차 애니메이션을 위해 index prop 사용
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

        <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors line-clamp-2">
          {post.title}
        </h2>

        <p className="text-sm text-gray-400 mb-4 line-clamp-2">
          {post.description}
        </p>

        <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-end">
          <span className="text-xs text-emerald-400 group-hover:translate-x-1 transition-transform">
            읽기 →
          </span>
        </div>
      </Link>
    </article>
  );
}

export default BlogCard;