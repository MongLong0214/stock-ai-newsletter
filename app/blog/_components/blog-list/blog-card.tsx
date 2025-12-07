import Link from 'next/link';
import { formatDateKo } from '../../_utils/date-formatter';
import type { BlogPostListItem } from '../../_types/blog';

const MAX_VISIBLE_TAGS = 4;

function BlogCard({ post, index }: { post: BlogPostListItem; index: number }) {
  return (
    <article
      className="group animate-fade-in-up h-full"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="relative flex flex-col h-full p-7 rounded-2xl border border-gray-800/50 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-md overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-500/20 hover:scale-[1.02] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 will-change-transform"
      >
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] via-teal-500/[0.02] to-emerald-500/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          aria-hidden="true"
        />

        <div
          className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-emerald-400/20 via-teal-400/10 to-transparent rounded-full blur-3xl opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-1000"
          aria-hidden="true"
        />

        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-full bg-gradient-to-r from-emerald-500/25 to-teal-500/15 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10 group-hover:shadow-emerald-500/30 group-hover:border-emerald-400/50 transition-all duration-300">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
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

        <h2 className="mb-4 h-[3.5rem] text-xl font-extrabold text-white line-clamp-2 leading-snug tracking-tight group-hover:text-emerald-300 transition-colors duration-400">
          {post.title}
        </h2>

        <p className="mb-5 h-[3rem] text-[15px] text-gray-400/90 line-clamp-2 leading-relaxed tracking-wide group-hover:text-gray-300 transition-colors duration-300">
          {post.description}
        </p>

        <div className="relative mt-auto pt-4 h-[4rem]">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800/60 to-transparent group-hover:via-gray-700/80 transition-colors duration-500" />

          <div className="flex flex-wrap gap-1.5 content-start">
            {post.tags && post.tags.length > 0 && (
              <>
                {post.tags.slice(0, MAX_VISIBLE_TAGS).map((tag, idx) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-500/90 bg-gradient-to-br from-gray-800/50 to-gray-800/70 rounded-md border border-gray-700/40 shadow-sm backdrop-blur-sm transition-all duration-300 ease-out group-hover:text-emerald-400/90 group-hover:from-gray-800/70 group-hover:to-gray-800/90 group-hover:border-emerald-500/25 group-hover:shadow-emerald-500/5 hover:scale-[1.08] hover:shadow-md hover:shadow-emerald-500/10 hover:-translate-y-0.5"
                    style={{ transitionDelay: `${idx * 25}ms` }}
                  >
                    <span className="mr-0.5 text-gray-600/70 group-hover:text-emerald-400/60">#</span>
                    {tag}
                  </span>
                ))}

                {post.tags.length > MAX_VISIBLE_TAGS && (
                  <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-600/80 bg-gray-800/30 rounded-md border border-gray-700/30 transition-all duration-300 ease-out group-hover:text-gray-500/90 group-hover:bg-gray-800/50 group-hover:border-gray-700/40">
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