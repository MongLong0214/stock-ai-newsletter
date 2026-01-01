/**
 * 태그 필터 컴포넌트
 * - 태그 검색, 선택, 더보기 기능 제공
 * - 엔터프라이즈급 상태 관리로 hydration 안정성 보장
 */
'use client';

import { useState, useMemo, useCallback, useRef, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';
import { TagButton } from './tag-button';
import { TagSearchInput } from './tag-search-input';

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  /** 초기 표시 태그 개수 */
  INITIAL_COUNT: 8,
  /** 더보기 클릭 시 추가 개수 */
  LOAD_MORE_COUNT: 12,
  /** 애니메이션 지연 시간 (밀리초) */
  ANIMATION_STAGGER_MS: 15,
} as const;

// ============================================================================
// 타입
// ============================================================================

interface TagFilterProps {
  /** 모든 태그와 출현 횟수 (출현 빈도순 정렬됨) */
  tags: Array<{ tag: string; count: number }>;
  /** 선택된 태그 Set */
  selectedTags: Set<string>;
  /** 태그 선택/해제 핸들러 */
  onToggle: (tag: string) => void;
}

interface ExpandState {
  /** 확장 레벨 (0 = 접힌 상태, 1 = 1단계 확장, ...) */
  level: number;
  /** 검색어 */
  searchQuery: string;
}

// ============================================================================
// 커스텀 훅: 확장 상태 관리
// ============================================================================

function useTagExpansion(totalCount: number) {
  const [state, setState] = useState<ExpandState>({ level: 0, searchQuery: '' });
  const [isPending, startTransition] = useTransition();
  const actionRef = useRef<number>(0);

  /** 현재 표시해야 할 태그 개수 계산 */
  const displayCount = useMemo(() => {
    const base = CONFIG.INITIAL_COUNT;
    const additional = state.level * CONFIG.LOAD_MORE_COUNT;
    return Math.min(base + additional, totalCount);
  }, [state.level, totalCount]);

  /** 더 표시할 태그가 있는지 */
  const hasMore = displayCount < totalCount;

  /** 확장되었는지 (접기 버튼 표시 여부) */
  const isExpanded = state.level > 0;

  /** 더보기 - useTransition으로 UI 블로킹 방지 */
  const expand = useCallback(() => {
    const actionId = ++actionRef.current;
    startTransition(() => {
      // 동시 클릭 방지: 최신 액션만 처리
      if (actionId !== actionRef.current) return;
      setState(prev => ({ ...prev, level: prev.level + 1 }));
    });
  }, []);

  /** 접기 */
  const collapse = useCallback(() => {
    const actionId = ++actionRef.current;
    startTransition(() => {
      if (actionId !== actionRef.current) return;
      setState({ level: 0, searchQuery: '' });
    });
  }, []);

  /** 검색어 변경 */
  const setSearchQuery = useCallback((query: string) => {
    const actionId = ++actionRef.current;
    startTransition(() => {
      if (actionId !== actionRef.current) return;
      setState({ level: 0, searchQuery: query });
    });
  }, []);

  return {
    displayCount,
    hasMore,
    isExpanded,
    searchQuery: state.searchQuery,
    isPending,
    expand,
    collapse,
    setSearchQuery,
  };
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================

export function TagFilter({ tags, selectedTags, onToggle }: TagFilterProps) {
  /**
   * 선택된 태그와 미선택 태그 분리
   */
  const { selectedTagsData, unselectedTagsData } = useMemo(() => {
    const selected: Array<{ tag: string; count: number }> = [];
    const unselected: Array<{ tag: string; count: number }> = [];

    for (const item of tags) {
      (selectedTags.has(item.tag) ? selected : unselected).push(item);
    }

    return { selectedTagsData: selected, unselectedTagsData: unselected };
  }, [tags, selectedTags]);

  /**
   * 검색어로 필터링된 미선택 태그
   */
  const { filteredTags, totalCount } = useMemo(() => {
    const filtered = unselectedTagsData;
    return { filteredTags: filtered, totalCount: filtered.length };
  }, [unselectedTagsData]);

  // 확장 상태 관리
  const {
    displayCount,
    hasMore,
    isExpanded,
    searchQuery,
    isPending,
    expand,
    collapse,
    setSearchQuery,
  } = useTagExpansion(totalCount);

  /**
   * 검색어로 필터링
   */
  const displayedTags = useMemo(() => {
    let result = filteredTags;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(({ tag }) => tag.toLowerCase().includes(query));
    }

    return result.slice(0, displayCount);
  }, [filteredTags, searchQuery, displayCount]);

  /** 실제로 더 표시할 태그가 있는지 (검색 결과 기준) */
  const actualHasMore = useMemo(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filteredCount = filteredTags.filter(({ tag }) =>
        tag.toLowerCase().includes(query)
      ).length;
      return displayCount < filteredCount;
    }
    return hasMore;
  }, [searchQuery, filteredTags, displayCount, hasMore]);

  /** 다음 로드에서 추가될 개수 */
  const nextLoadCount = Math.min(CONFIG.LOAD_MORE_COUNT, totalCount - displayCount);

  /** 남은 태그 개수 */
  const remainingCount = totalCount - displayCount;

  // 태그가 없으면 렌더링하지 않음
  if (tags.length === 0) return null;

  const totalFiltered = selectedTagsData.length + displayedTags.length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
              <Icons.Tag className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <span className="font-medium text-gray-300">태그</span>
          </div>

          {/* 선택된 태그 개수 배지 */}
          {selectedTags.size > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
              aria-label={`${selectedTags.size}개 태그 선택됨`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 tabular-nums">
                {selectedTags.size}
              </span>
            </div>
          )}

          {/* 진행률 표시 */}
          {!searchQuery && displayCount < totalCount && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/40 border border-gray-700/30">
              <span className="text-xs text-gray-500">
                {displayCount}/{totalCount}
              </span>
            </div>
          )}

          {/* 검색 결과 개수 */}
          {searchQuery && (
            <span className="text-xs text-gray-500" aria-live="polite">
              {totalFiltered}개 결과
            </span>
          )}

          {/* 로딩 인디케이터 */}
          {isPending && (
            <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          )}
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
            const isNew = isExpanded && index >= displayCount - CONFIG.LOAD_MORE_COUNT;
            return (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected={false}
                onClick={() => onToggle(tag)}
                isNewlyAdded={isNew}
                animationDelay={isNew ? (index - (displayCount - CONFIG.LOAD_MORE_COUNT)) * CONFIG.ANIMATION_STAGGER_MS : 0}
              />
            );
          })}
        </div>

        {/* 검색 결과 없음 */}
        {displayedTags.length === 0 && searchQuery && (
          <div className="py-12 text-center" role="status">
            <div className="inline-flex flex-col items-center gap-3">
              <div className="p-3 rounded-2xl bg-gray-800/50 border border-gray-700/50">
                <Icons.Search className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-sm font-medium text-gray-400">검색 결과 없음</p>
            </div>
          </div>
        )}
      </div>

      {/* 더보기/접기 버튼 */}
      <div className="flex items-center justify-center gap-3 pt-2">
        {/* 접기 버튼 */}
        {isExpanded && (
          <button
            type="button"
            onClick={collapse}
            disabled={isPending}
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
            <Icons.ChevronDown className="w-3.5 h-3.5 rotate-180 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        )}

        {/* 더보기 버튼 */}
        {actualHasMore && (
          <button
            type="button"
            onClick={expand}
            disabled={isPending}
            aria-label={`${nextLoadCount}개 태그 더 보기 (전체 ${remainingCount}개 남음)`}
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
              <Icons.ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-400 transition-colors" />
              <div className="flex flex-col items-start">
                <span className="text-gray-400 group-hover:text-emerald-400 transition-colors font-semibold">
                  {nextLoadCount}개 더 보기
                </span>
                <span className="text-[10px] text-gray-600 group-hover:text-gray-500 transition-colors">
                  전체 {remainingCount}개 남음
                </span>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
