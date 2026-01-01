/**
 * 태그 필터 컴포넌트
 * - 500+ 태그 환경에서 최적화됨
 * - 검색 debounce (150ms)
 * - Event delegation으로 클릭 핸들러 최적화
 * - 접근성(A11y) 준수
 */
'use client';

import { useMemo, useId, useCallback, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';
import { TagButton } from './tag-button';
import { TagSearchInput } from './tag-search-input';
import { useTagExpansion, TAG_EXPANSION_CONFIG } from '../../_hooks/use-tag-expansion';
import { partitionTags, filterTagsByQuery, type TagData } from '../../_utils/tag-utils';

// ============================================================================
// 타입
// ============================================================================

interface TagFilterProps {
  /** 모든 태그와 출현 횟수 (출현 빈도순 정렬됨) */
  tags: TagData[];
  /** 선택된 태그 Set */
  selectedTags: Set<string>;
  /** 태그 선택/해제 핸들러 - useCallback으로 안정화 권장 */
  onToggle: (tag: string) => void;
}


// ============================================================================
// 서브 컴포넌트
// ============================================================================

/** 선택된 태그 개수 배지 */
function SelectedBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
      role="status"
      aria-live="polite"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
      <span className="text-xs font-semibold text-emerald-400 tabular-nums">{count}</span>
    </div>
  );
}

/** 진행률 표시 */
function ProgressIndicator({ current, total }: { current: number; total: number }) {
  if (current >= total) return null;

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/40 border border-gray-700/30">
      <span className="text-xs text-gray-500 tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
}

/** 검색 결과 없음 */
function EmptySearchResult() {
  return (
    <div className="py-12 text-center" role="status" aria-live="polite">
      <div className="inline-flex flex-col items-center gap-3">
        <div className="p-3 rounded-2xl bg-gray-800/50 border border-gray-700/50">
          <Icons.Search className="w-6 h-6 text-gray-600" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-400">검색 결과 없음</p>
      </div>
    </div>
  );
}

/** 접기 버튼 */
function CollapseButton({
  onClick,
  isExpanded,
  controlsId,
}: {
  onClick: () => void;
  isExpanded: boolean;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg',
        'text-gray-500 hover:text-emerald-400 active:text-emerald-500',
        'hover:bg-gray-800/40 active:bg-gray-800/60',
        'transition-all duration-200'
      )}
      aria-expanded={isExpanded}
      aria-controls={controlsId}
      aria-label="태그 목록 접기"
    >
      <span>접기</span>
      <Icons.ChevronDown
        className="w-3.5 h-3.5 rotate-180 group-hover:-translate-y-0.5 transition-transform"
        aria-hidden="true"
      />
    </button>
  );
}

/** 더보기 버튼 */
function ExpandButton({
  onClick,
  isExpanded,
  controlsId,
  nextCount,
  remainingCount,
}: {
  onClick: () => void;
  isExpanded: boolean;
  controlsId: string;
  nextCount: number;
  remainingCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isExpanded}
      aria-controls={controlsId}
      aria-label={`${nextCount}개 태그 더 보기 (전체 ${remainingCount}개 남음)`}
      className={cn(
        'group relative px-5 py-2.5 text-xs font-medium rounded-xl overflow-hidden',
        'bg-gradient-to-br from-gray-800/60 to-gray-800/40 backdrop-blur-sm',
        'border border-gray-700/50',
        'hover:from-gray-800/80 hover:to-gray-800/60 hover:border-emerald-500/30',
        'hover:shadow-lg hover:shadow-emerald-500/5',
        'active:from-gray-800/90 active:to-gray-800/70 active:border-emerald-500/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        'transition-all duration-200'
      )}
    >
      <div
        className="absolute inset-0 pointer-events-none bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
        aria-hidden="true"
      />
      <div className="relative flex items-center gap-2">
        <Icons.ChevronDown
          className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-400 transition-colors"
          aria-hidden="true"
        />
        <div className="flex flex-col items-start">
          <span className="text-gray-400 group-hover:text-emerald-400 transition-colors font-semibold">
            {nextCount}개 더 보기
          </span>
          <span className="text-[10px] text-gray-600 group-hover:text-gray-500 transition-colors">
            전체 {remainingCount}개 남음
          </span>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function TagFilter({ tags, selectedTags, onToggle }: TagFilterProps) {
  // 접근성을 위한 고유 ID
  const tagListId = useId();

  // 선택/미선택 태그 분리 - 훅보다 먼저 early return 금지!
  const { selected, unselected } = useMemo(
    () => partitionTags(tags, selectedTags),
    [tags, selectedTags]
  );

  // 확장 상태 관리 (debounce 포함)
  const {
    displayCount,
    isExpanded,
    searchQuery,
    debouncedSearchQuery,
    loadMoreCount,
    expand,
    collapse,
    setSearchQuery,
    clearSearch,
  } = useTagExpansion({ totalCount: unselected.length });

  // 검색 필터링 (debounce된 검색어 사용)
  const filteredTags = useMemo(
    () => filterTagsByQuery(unselected, debouncedSearchQuery),
    [unselected, debouncedSearchQuery]
  );

  // 표시할 태그 (slice만 수행, 애니메이션은 렌더 시 계산)
  const displayedTags = useMemo(
    () => filteredTags.slice(0, displayCount),
    [filteredTags, displayCount]
  );

  // 애니메이션 시작 인덱스 (더보기로 추가된 태그부터)
  const animationStartIndex = displayCount - loadMoreCount;

  // 더 표시할 태그가 있는지
  const hasMoreFiltered = displayCount < filteredTags.length;

  // 다음 로드 개수 & 남은 개수 (조건부 렌더링에서만 사용)
  const nextLoadCount = hasMoreFiltered
    ? Math.min(loadMoreCount, filteredTags.length - displayCount)
    : 0;
  const remainingCount = hasMoreFiltered
    ? filteredTags.length - displayCount
    : 0;

  // Event delegation: 컨테이너에서 클릭 처리 (500+ 버튼에 단일 핸들러)
  const handleTagClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const button = (e.target as HTMLElement).closest('button[data-tag]');
      if (button instanceof HTMLButtonElement && button.dataset.tag) {
        onToggle(button.dataset.tag);
      }
    },
    [onToggle]
  );

  // 태그가 없으면 렌더링하지 않음 (훅 호출 이후!)
  if (tags.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
              <Icons.Tag className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            </div>
            <span className="font-medium text-gray-300">태그</span>
          </div>

          <SelectedBadge count={selectedTags.size} />

          {!searchQuery && (
            <ProgressIndicator current={displayCount} total={filteredTags.length} />
          )}

          {searchQuery && (
            <span className="text-xs text-gray-500" aria-live="polite">
              {filteredTags.length}개 결과
            </span>
          )}
        </div>

        <TagSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={clearSearch}
        />
      </div>

      {/* 태그 영역 - Event Delegation */}
      <div className="space-y-3" onClick={handleTagClick}>
        {/* 선택된 태그 */}
        {selected.length > 0 && (
          <div
            className="flex flex-wrap gap-2 pb-3 border-b border-gray-800/50"
            role="group"
            aria-label="선택된 태그"
          >
            {selected.map(({ tag, count }) => (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected
              />
            ))}
          </div>
        )}

        {/* 미선택 태그 */}
        <div
          id={tagListId}
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="태그 필터"
        >
          {displayedTags.map(({ tag, count }, index) => {
            const isNewlyAdded = isExpanded && index >= animationStartIndex;
            return (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected={false}
                isNewlyAdded={isNewlyAdded}
                animationDelay={isNewlyAdded ? (index - animationStartIndex) * TAG_EXPANSION_CONFIG.ANIMATION_STAGGER_MS : 0}
              />
            );
          })}
        </div>

        {/* 검색 결과 없음 */}
        {displayedTags.length === 0 && debouncedSearchQuery && <EmptySearchResult />}
      </div>

      {/* 더보기/접기 버튼 */}
      {(isExpanded || hasMoreFiltered) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {isExpanded && (
            <CollapseButton
              onClick={collapse}
              isExpanded={isExpanded}
              controlsId={tagListId}
            />
          )}
          {hasMoreFiltered && (
            <ExpandButton
              onClick={expand}
              isExpanded={isExpanded}
              controlsId={tagListId}
              nextCount={nextLoadCount}
              remainingCount={remainingCount}
            />
          )}
        </div>
      )}
    </div>
  );
}
