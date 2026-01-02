'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDateKo } from '../../_utils/date-formatter';
import type { BlogPostListItem } from '../../_types/blog';

const MAX_VISIBLE_TAGS = 4;
const MAX_ANIMATED_CARDS = 12;

/**
 * 블로그 카드 컴포넌트
 * - iOS Safari :active 지원을 위해 onTouchStart 필요
 */
function BlogCard({ post, index }: { post: BlogPostListItem; index: number }) {
  const shouldAnimate = index < MAX_ANIMATED_CARDS;
  const animationDelay = shouldAnimate ? `${100 + index * 50}ms` : '0ms';

  return (
    <article
      className={cn('group h-full', shouldAnimate && 'animate-fade-in-up')}
      style={shouldAnimate ? { animationDelay } : undefined}
    >
      <Link
        href={`/blog/${post.slug}`}
        // iOS Safari에서 :active 작동시키려면 빈 onTouchStart 필요
        onTouchStart={() => {}}
        className={cn(
          'relative flex flex-col h-full p-7 rounded-2xl overflow-hidden',
          'border border-gray-800/50 bg-gradient-to-br from-gray-900/90 to-gray-950/90',
          'transition-all duration-200',
          // Hover (데스크톱)
          'hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/10',
          'hover:scale-[1.02] hover:-translate-y-1',
          // Active (은은한 피드백)
          'active:scale-[0.995] active:opacity-80',
          // Focus
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50'
        )}
      >
        {/* Hover gradient */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200"
          aria-hidden="true"
        />

        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-full bg-gradient-to-r from-emerald-500/25 to-teal-500/15 text-emerald-400 border border-emerald-500/40">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Stock Matrix
          </span>

          {post.published_at && (
            <time
              dateTime={post.published_at}
              className="text-[11px] font-medium text-gray-500/90 group-hover:text-gray-400 transition-colors duration-300 tracking-wide"
            >
              {formatDateKo(post.published_at)}
            </time>
          )}
        </div>

        <h2 className="mb-4 h-[3.5rem] text-xl font-extrabold text-white line-clamp-2 leading-snug tracking-tight group-hover:text-emerald-300 transition-colors duration-300">
          {post.title}
        </h2>

        <p className="mb-5 h-[3rem] text-[15px] text-gray-400/90 line-clamp-2 leading-relaxed tracking-wide group-hover:text-gray-300 transition-colors duration-300">
          {post.description}
        </p>

        <div className="relative mt-auto pt-4 h-[4rem]">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800/60 to-transparent" />

          <div className="flex flex-wrap gap-1.5 content-start">
            {post.tags && post.tags.length > 0 && (
              <>
                {post.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-500/90 bg-gray-800/50 rounded-md border border-gray-700/40 group-hover:text-emerald-400/90 group-hover:border-emerald-500/25 transition-colors duration-300"
                  >
                    <span className="mr-0.5 text-gray-600/70 group-hover:text-emerald-400/60">#</span>
                    {tag}
                  </span>
                ))}

                {post.tags.length > MAX_VISIBLE_TAGS && (
                  <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-600/80 bg-gray-800/30 rounded-md border border-gray-700/30">
                    +{post.tags.length - MAX_VISIBLE_TAGS}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export default BlogCard;