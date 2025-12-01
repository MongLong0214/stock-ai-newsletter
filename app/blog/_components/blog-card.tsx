/**
 * 블로그 카드 컴포넌트
 *
 * [이 파일의 역할]
 * - 블로그 목록 페이지에서 각 포스트를 카드 형태로 표시
 * - 제목, 설명, 카테고리, 태그, 조회수 정보 표시
 *
 * [사용 위치]
 * - /blog 페이지 (블로그 목록)
 *
 * [CSS 애니메이션]
 * - animate-fade-in-up: 아래에서 위로 페이드인
 * - animationDelay: 카드마다 100ms씩 지연하여 순차 애니메이션
 *
 * [hover 효과]
 * - 배경색 변경 (gray-900/50 → gray-800/70)
 * - 테두리 색상 변경 (gray-800 → emerald-500/50)
 * - 제목 색상 변경 (white → emerald-400)
 * - '읽기' 버튼 오른쪽으로 이동
 */

import Link from 'next/link';
import { formatDateKo } from '../_utils/date-formatter';
import type { BlogPostListItem } from '../_types/blog';

/**
 * BlogCard 컴포넌트 Props
 *
 * @property post - 표시할 블로그 포스트 데이터
 * @property index - 목록에서의 순서 (애니메이션 지연용)
 */
interface BlogCardProps {
  /** 표시할 블로그 포스트 데이터 */
  post: BlogPostListItem;
  /** 목록에서의 순서 (0부터 시작, 애니메이션 지연 계산에 사용) */
  index: number;
}

/**
 * 블로그 카드 컴포넌트
 *
 * [렌더링 구조]
 * 1. 카테고리 뱃지 + 발행일
 * 2. 제목 (최대 2줄)
 * 3. 설명 (최대 2줄)
 * 4. 태그 목록 (최대 3개)
 * 5. 조회수 + '읽기' 버튼
 *
 * @example
 * <BlogCard
 *   post={{
 *     slug: 'best-stock-newsletter',
 *     title: '2024년 최고의 주식 뉴스레터',
 *     description: 'AI 기반 주식 분석...',
 *     ...
 *   }}
 *   index={0}
 * />
 */
function BlogCard({ post, index }: BlogCardProps) {
  return (
    // article 태그: 독립적인 콘텐츠 블록 (시맨틱 HTML)
    // group: Tailwind 그룹 기능 (자식 요소에서 group-hover 사용 가능)
    <article
      className="group animate-fade-in-up"
      // 순서에 따라 애니메이션 지연 (0번: 0ms, 1번: 100ms, 2번: 200ms...)
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* 카드 전체를 링크로 감싸서 클릭 영역 확대 */}
      <Link
        href={`/blog/${post.slug}`}
        className="block p-6 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/70 hover:border-emerald-500/50 transition-all duration-300"
      >
        {/* 상단: 카테고리 뱃지 & 발행일 */}
        <div className="flex items-center gap-3 mb-3">
          {/* 카테고리 뱃지 (emerald 테마) */}
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {/* 카테고리가 없으면 기본값 '주식 뉴스레터' */}
            {post.category || '주식 뉴스레터'}
          </span>
          {/* 발행일 (없으면 표시하지 않음) */}
          {post.published_at && (
            <span className="text-xs text-gray-500">
              {/* formatDateKo: ISO 날짜 → 한국어 형식 (예: '2024년 1월 15일') */}
              {formatDateKo(post.published_at)}
            </span>
          )}
        </div>

        {/* 제목 (hover 시 emerald 색상으로 변경) */}
        {/* line-clamp-2: 최대 2줄, 초과 시 ... 표시 */}
        <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors line-clamp-2">
          {post.title}
        </h2>

        {/* 설명 (최대 2줄) */}
        <p className="text-sm text-gray-400 mb-4 line-clamp-2">
          {post.description}
        </p>

        {/* 태그 목록 (있는 경우에만 표시, 최대 3개) */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {/* slice(0, 3): 첫 3개 태그만 표시 */}
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

        {/* 하단: 조회수 & 읽기 버튼 */}
        <div className="mt-4 pt-4 border-t border-gray-800 flex items-center justify-between">
          {/* 조회수 (눈 아이콘 + 숫자) */}
          <span className="text-xs text-gray-500 flex items-center gap-1">
            {/* SVG 눈 아이콘 */}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {/* 눈동자 (원) */}
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              {/* 눈 외곽선 */}
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            {/* toLocaleString(): 천 단위 구분자 (예: 1,234) */}
            {post.view_count.toLocaleString()}
          </span>

          {/* '읽기' 버튼 (hover 시 오른쪽으로 살짝 이동) */}
          <span className="text-xs text-emerald-400 group-hover:translate-x-1 transition-transform">
            읽기 →
          </span>
        </div>
      </Link>
    </article>
  );
}

export default BlogCard;