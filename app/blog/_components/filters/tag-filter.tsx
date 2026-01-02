/**
 * 태그 필터 컴포넌트
 * - 500+ 태그 환경 최적화 (Event delegation)
 * - 검색 debounce 150ms
 */
'use client';

import { useMemo, useId, useCallback, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';
import { TagButton } from './tag-button';
import { TagSearchInput } from './tag-search-input';
import { useTagExpansion, TAG_EXPANSION_CONFIG } from '../../_hooks/use-tag-expansion';
import { partitionTags, filterTagsByQuery, type TagData } from '../../_utils/tag-utils';

interface TagFilterProps {
  tags: TagData[];
  selectedTags: Set<string>;
  onToggle: (tag: string) => void;
}

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
    prevDisplayCount,
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

  // 표시할 태그
  const displayedTags = useMemo(
    () => filteredTags.slice(0, displayCount),
    [filteredTags, displayCount]
  );

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
            const isNewlyAdded = isExpanded && index >= prevDisplayCount;
            return (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected={false}
                isNewlyAdded={isNewlyAdded}
                animationDelay={isNewlyAdded ? (index - prevDisplayCount) * TAG_EXPANSION_CONFIG.ANIMATION_STAGGER_MS : 0}
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
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); collapse(); }}
              className={cn(
                'group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg',
                'text-gray-500 hover:text-emerald-400 hover:bg-gray-800/40',
                'transition-all duration-200 touch-manipulation'
              )}
              aria-expanded={isExpanded}
              aria-controls={tagListId}
              aria-label="태그 목록 접기"
            >
              <span>접기</span>
              <Icons.ChevronDown className="w-3.5 h-3.5 rotate-180" aria-hidden="true" />
            </button>
          )}
          {hasMoreFiltered && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); expand(); }}
              className={cn(
                'group px-5 py-2.5 text-xs font-medium rounded-xl',
                'bg-gray-800/50 border border-gray-700/50',
                'hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5',
                'transition-all duration-200 touch-manipulation'
              )}
              aria-expanded={isExpanded}
              aria-controls={tagListId}
              aria-label={`${nextLoadCount}개 태그 더 보기 (전체 ${remainingCount}개 남음)`}
            >
              <div className="flex items-center gap-2">
                <Icons.ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-400" aria-hidden="true" />
                <div className="flex flex-col items-start">
                  <span className="text-gray-400 group-hover:text-emerald-400 font-semibold">
                    {nextLoadCount}개 더 보기
                  </span>
                  <span className="text-[10px] text-gray-600">{remainingCount}개 남음</span>
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 선택된 태그 배지 - 스크린리더에 실시간 알림 */
function SelectedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
      <span className="text-xs font-semibold text-emerald-400 tabular-nums">{count}</span>
    </div>
  );
}

/** 진행률 */
function ProgressIndicator({ current, total }: { current: number; total: number }) {
  if (current >= total) return null;
  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/40 border border-gray-700/30">
      <span className="text-xs text-gray-500 tabular-nums">{current}/{total}</span>
    </div>
  );
}

/** 검색 결과 없음 - 스크린리더에 알림 */
function EmptySearchResult() {
  return (
    <div role="status" aria-live="polite" className="py-12 text-center">
      <div className="inline-flex flex-col items-center gap-3">
        <div className="p-3 rounded-2xl bg-gray-800/50 border border-gray-700/50">
          <Icons.Search className="w-6 h-6 text-gray-600" aria-hidden="true" />
        </div>
        <p className="text-sm text-gray-400">검색 결과 없음</p>
      </div>
    </div>
  );
}
