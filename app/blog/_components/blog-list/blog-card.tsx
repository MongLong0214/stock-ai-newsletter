/**
 * 블로그 카드 컴포넌트
 */

import Link from 'next/link';
import { formatDateKo } from '../../_utils/date-formatter';
import type { BlogPostListItem } from '../../_types/blog';

// ============================================================================
// 상수 정의
// ============================================================================

/**
 * 애니메이션 지연 시간 (밀리초)
 *
 * [용도]
 * - 카드 목록에서 순차적 나타남 효과 (stagger)
 * - 카드 index × ANIMATION_STAGGER_MS = 지연 시간
 *
 * [예시]
 * - 첫 번째 카드: 0ms
 * - 두 번째 카드: 60ms
 * - 세 번째 카드: 120ms
 */
const ANIMATION_STAGGER_MS = 60;

/**
 * 태그 미리보기 최대 개수
 *
 * [이유]
 * - UI 공간 절약
 * - 모바일 반응형 대응
 * - 5개 초과 시 "+n" 표시
 */
const MAX_VISIBLE_TAGS = 5;

// ============================================================================
// 타입 정의
// ============================================================================

interface BlogCardProps {
  /** 블로그 포스트 데이터 */
  post: BlogPostListItem;
  /** 목록에서의 순서 (애니메이션 지연 계산용) */
  index: number;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

/**
 * 블로그 카드
 */
function BlogCard({ post, index }: BlogCardProps) {
  return (
    <article
      className="group animate-fade-in-up h-full"
      style={{ animationDelay: `${index * ANIMATION_STAGGER_MS}ms` }}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="relative flex flex-col h-full p-6 rounded-2xl border border-gray-800/50 bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm overflow-hidden transition-all duration-500 ease-out hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-2"
      >
        {/* 배경 글로우 효과 (호버 시) */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          aria-hidden="true"
        />

        {/* 우측 상단 글로우 (호버 시) */}
        <div
          className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
          aria-hidden="true"
        />

        {/* 헤더: 배지 + 발행일 */}
        <div className="relative flex items-center gap-3 mb-4">
          {/* Stock Matrix 배지 */}
          <span className="inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-400/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/5 group-hover:shadow-emerald-500/20 transition-all duration-300">
            Stock Matrix
          </span>

          {/* 발행일 */}
          {post.published_at && (
            <time
              dateTime={post.published_at}
              className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors"
            >
              {formatDateKo(post.published_at)}
            </time>
          )}
        </div>

        {/* 제목 */}
        <h2 className="relative text-lg font-bold text-white mb-3 line-clamp-2 leading-snug group-hover:text-emerald-400 transition-colors duration-300">
          {post.title}
        </h2>

        {/* 설명 */}
        <p className="relative text-sm text-gray-400 mb-4 line-clamp-2 leading-relaxed group-hover:text-gray-300 transition-colors">
          {post.description}
        </p>

        {/* 태그 영역 (하단 고정) */}
        {post.tags && post.tags.length > 0 && (
          <div className="relative mt-auto pt-3 border-t border-gray-800/50 group-hover:border-gray-700/50 transition-colors">
            <div className="flex flex-wrap gap-1.5">
              {/* 태그 미리보기 (최대 5개) */}
              {post.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs text-gray-500 bg-gray-800/50 rounded-lg border border-gray-700/40 group-hover:text-emerald-400/70 group-hover:bg-gray-800/70 group-hover:border-emerald-500/20 transition-all duration-300"
                >
                  #{tag}
                </span>
              ))}

              {/* 더 많은 태그 표시 (5개 초과 시) */}
              {post.tags.length > MAX_VISIBLE_TAGS && (
                <span className="px-2 py-1 text-xs text-gray-600 group-hover:text-gray-500 transition-colors">
                  +{post.tags.length - MAX_VISIBLE_TAGS}
                </span>
              )}
            </div>
          </div>
        )}
      </Link>
    </article>
  );
}

export default BlogCard;