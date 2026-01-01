/**
 * 태그 필터 컴포넌트
 * - 태그 검색, 선택, 더보기 기능 제공
 * - 엔터프라이즈급 상태 관리로 hydration 안정성 보장
 */
'use client';

import { useMemo, memo } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';
import { TagButton } from './tag-button';
import { TagSearchInput } from './tag-search-input';
import { useTagExpansion, TAG_EXPANSION_CONFIG } from '../../_hooks/use-tag-expansion';

// ============================================================================
// 타입
// ============================================================================

interface TagData {
  tag: string;
  count: number;
}

interface TagFilterProps {
  /** 모든 태그와 출현 횟수 (출현 빈도순 정렬됨) */
  tags: TagData[];
  /** 선택된 태그 Set */
  selectedTags: Set<string>;
  /** 태그 선택/해제 핸들러 */
  onToggle: (tag: string) => void;
}

// ============================================================================
// 유틸리티
// ============================================================================

/** 태그를 선택/미선택으로 분리 */
function partitionTags(tags: TagData[], selectedTags: Set<string>) {
  const selected: TagData[] = [];
  const unselected: TagData[] = [];

  for (const item of tags) {
    (selectedTags.has(item.tag) ? selected : unselected).push(item);
  }

  return { selected, unselected };
}

/** 검색어로 태그 필터링 */
function filterTagsByQuery(tags: TagData[], query: string): TagData[] {
  if (!query.trim()) return tags;
  const lowerQuery = query.toLowerCase();
  return tags.filter(({ tag }) => tag.toLowerCase().includes(lowerQuery));
}

// ============================================================================
// 서브 컴포넌트
// ============================================================================

/** 선택된 태그 개수 배지 */
const SelectedBadge = memo(function SelectedBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
      aria-label={`${count}개 태그 선택됨`}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-xs font-semibold text-emerald-400 tabular-nums">{count}</span>
    </div>
  );
});

/** 진행률 표시 */
const ProgressIndicator = memo(function ProgressIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  if (current >= total) return null;

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/40 border border-gray-700/30">
      <span className="text-xs text-gray-500 tabular-nums">
        {current}/{total}
      </span>
    </div>
  );
});

/** 로딩 스피너 */
const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div
      className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin"
      role="status"
      aria-label="로딩 중"
    />
  );
});

/** 검색 결과 없음 */
const EmptySearchResult = memo(function EmptySearchResult() {
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
});

/** 접기 버튼 */
const CollapseButton = memo(function CollapseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg',
        'text-gray-500 hover:text-emerald-400 active:text-emerald-500',
        'hover:bg-gray-800/40 active:bg-gray-800/60',
        'transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
      aria-label="태그 목록 접기"
    >
      <span>접기</span>
      <Icons.ChevronDown
        className="w-3.5 h-3.5 rotate-180 group-hover:-translate-y-0.5 transition-transform"
        aria-hidden="true"
      />
    </button>
  );
});

/** 더보기 버튼 */
const ExpandButton = memo(function ExpandButton({
  onClick,
  disabled,
  nextCount,
  remainingCount,
}: {
  onClick: () => void;
  disabled: boolean;
  nextCount: number;
  remainingCount: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
        'transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      {/* 호버 글로우 효과 */}
      <div
        className="absolute inset-0 pointer-events-none bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
        aria-hidden="true"
      />

      {/* 버튼 내용 */}
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
});

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export const TagFilter = memo(function TagFilter({
  tags,
  selectedTags,
  onToggle,
}: TagFilterProps) {
  // 태그가 없으면 렌더링하지 않음
  if (tags.length === 0) return null;

  // 선택/미선택 태그 분리 (메모이제이션)
  const { selectedTagsData, unselectedTagsData } = useMemo(
    () => {
      const { selected, unselected } = partitionTags(tags, selectedTags);
      return { selectedTagsData: selected, unselectedTagsData: unselected };
    },
    [tags, selectedTags]
  );

  // 확장 상태 관리
  const {
    displayCount,
    isExpanded,
    searchQuery,
    isPending,
    expand,
    collapse,
    setSearchQuery,
  } = useTagExpansion(unselectedTagsData.length);

  // 검색 필터링된 태그 (단일 연산으로 캐싱)
  const searchFilteredTags = useMemo(
    () => filterTagsByQuery(unselectedTagsData, searchQuery),
    [unselectedTagsData, searchQuery]
  );

  // 표시할 태그 (슬라이싱만)
  const displayedTags = useMemo(
    () => searchFilteredTags.slice(0, displayCount),
    [searchFilteredTags, displayCount]
  );

  // 더 표시할 태그가 있는지
  const hasMore = displayCount < searchFilteredTags.length;

  // 다음 로드 개수 & 남은 개수
  const nextLoadCount = Math.min(
    TAG_EXPANSION_CONFIG.LOAD_MORE_COUNT,
    searchFilteredTags.length - displayCount
  );
  const remainingCount = searchFilteredTags.length - displayCount;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* 태그 아이콘 */}
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
              <Icons.Tag className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            </div>
            <span className="font-medium text-gray-300">태그</span>
          </div>

          <SelectedBadge count={selectedTags.size} />

          {!searchQuery && (
            <ProgressIndicator current={displayCount} total={searchFilteredTags.length} />
          )}

          {searchQuery && (
            <span className="text-xs text-gray-500" aria-live="polite">
              {searchFilteredTags.length}개 결과
            </span>
          )}

          {isPending && <LoadingSpinner />}
        </div>

        <TagSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      </div>

      {/* 태그 영역 */}
      <div className="space-y-3">
        {/* 선택된 태그 */}
        {selectedTagsData.length > 0 && (
          <div
            className="flex flex-wrap gap-2 pb-3 border-b border-gray-800/50"
            role="group"
            aria-label="선택된 태그"
          >
            {selectedTagsData.map(({ tag, count }) => (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected
                onClick={() => onToggle(tag)}
              />
            ))}
          </div>
        )}

        {/* 미선택 태그 */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="태그 필터">
          {displayedTags.map(({ tag, count }, index) => {
            const isNewlyAdded =
              isExpanded && index >= displayCount - TAG_EXPANSION_CONFIG.LOAD_MORE_COUNT;
            const animationDelay = isNewlyAdded
              ? (index - (displayCount - TAG_EXPANSION_CONFIG.LOAD_MORE_COUNT)) *
                TAG_EXPANSION_CONFIG.ANIMATION_STAGGER_MS
              : 0;

            return (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected={false}
                onClick={() => onToggle(tag)}
                isNewlyAdded={isNewlyAdded}
                animationDelay={animationDelay}
              />
            );
          })}
        </div>

        {/* 검색 결과 없음 */}
        {displayedTags.length === 0 && searchQuery && <EmptySearchResult />}
      </div>

      {/* 더보기/접기 버튼 */}
      {(isExpanded || hasMore) && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {isExpanded && <CollapseButton onClick={collapse} disabled={isPending} />}
          {hasMore && (
            <ExpandButton
              onClick={expand}
              disabled={isPending}
              nextCount={nextLoadCount}
              remainingCount={remainingCount}
            />
          )}
        </div>
      )}
    </div>
  );
});
