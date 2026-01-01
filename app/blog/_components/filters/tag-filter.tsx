/**
 * 태그 필터 컴포넌트
 * - 태그 검색, 선택, 더보기 기능 제공
 */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Icons } from '../shared/icons';
import { TagButton } from './tag-button';
import { TagSearchInput } from './tag-search-input';
import { useResponsiveValue } from '../../_hooks/use-media-query';

/** 모바일 초기 표시 태그 개수 */
const MOBILE_INITIAL_COUNT = 6;
/** 데스크톱 초기 표시 태그 개수 */
const DESKTOP_INITIAL_COUNT = 12;
/** 모바일 더보기 클릭 시 추가 개수 */
const MOBILE_LOAD_MORE_COUNT = 10;
/** 데스크톱 더보기 클릭 시 추가 개수 */
const DESKTOP_LOAD_MORE_COUNT = 20;
/** 애니메이션 지연 시간 (밀리초) */
const ANIMATION_STAGGER_MS = 15;

interface TagFilterProps {
  /** 모든 태그와 출현 횟수 (출현 빈도순 정렬됨) */
  tags: Array<{ tag: string; count: number }>;
  /** 선택된 태그 Set */
  selectedTags: Set<string>;
  /** 태그 선택/해제 핸들러 */
  onToggle: (tag: string) => void;
}

export function TagFilter({ tags, selectedTags, onToggle }: TagFilterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(MOBILE_INITIAL_COUNT);

  /** 반응형 초기 표시 개수 (SSR-safe, hydration mismatch 방지) */
  const initialCount = useResponsiveValue('md', {
    mobile: MOBILE_INITIAL_COUNT,
    desktop: DESKTOP_INITIAL_COUNT,
  });

  /** 반응형 더보기 개수 */
  const loadMoreCount = useResponsiveValue('md', {
    mobile: MOBILE_LOAD_MORE_COUNT,
    desktop: DESKTOP_LOAD_MORE_COUNT,
  });

  /** Breakpoint 변경 시 displayCount를 initialCount와 동기화 */
  useEffect(() => {
    setDisplayCount(initialCount);
  }, [initialCount]);

  /**
   * 선택된 태그와 미선택 태그 분리
   * - selectedTags Set의 O(1) 조회로 분류
   */
  const { selectedTagsData, unselectedTagsData } = useMemo(() => {
    const selected: Array<{ tag: string; count: number }> = [];
    const unselected: Array<{ tag: string; count: number }> = [];

    tags.forEach((item) => {
      (selectedTags.has(item.tag) ? selected : unselected).push(item);
    });

    return { selectedTagsData: selected, unselectedTagsData: unselected };
  }, [tags, selectedTags]);

  /**
   * 검색어로 미선택 태그 필터링
   * - 대소문자 무시하고 includes 검색
   */
  const filteredUnselectedTags = useMemo(() => {
    if (!searchQuery.trim()) return unselectedTagsData;
    const query = searchQuery.toLowerCase();
    return unselectedTagsData.filter(({ tag }) => tag.toLowerCase().includes(query));
  }, [unselectedTagsData, searchQuery]);

  if (tags.length === 0) return null;

  const displayedTags = filteredUnselectedTags.slice(0, displayCount);
  const hasMore = filteredUnselectedTags.length > displayCount;
  const totalFiltered = selectedTagsData.length + filteredUnselectedTags.length;

  /** 다음 로드에서 추가될 실제 개수 */
  const nextLoadCount = Math.min(loadMoreCount, filteredUnselectedTags.length - displayCount);
  /** 남은 태그 개수 */
  const remainingCount = filteredUnselectedTags.length - displayCount;

  /** 더보기 */
  const handleLoadMore = () => setDisplayCount((prev) => Math.min(prev + loadMoreCount, filteredUnselectedTags.length));
  /** 접기 + 검색어 초기화 */
  const handleReset = () => { setDisplayCount(initialCount); setSearchQuery(''); };
  /** 검색어 변경 */
  const handleSearchChange = (value: string) => { setSearchQuery(value); setDisplayCount(initialCount); };

  return (
    <div className="space-y-4">
      {/* 헤더: 태그 아이콘 + 선택 개수 + 검색 */}
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
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 border border-emerald-500/30 shadow-lg shadow-emerald-500/10" aria-label={`${selectedTags.size}개 태그 선택됨`}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 tabular-nums">{selectedTags.size}</span>
            </div>
          )}

          {/* 진행률 표시 (검색 중이 아닐 때만) */}
          {!searchQuery && displayCount < filteredUnselectedTags.length && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/40 border border-gray-700/30">
              <span className="text-xs text-gray-500">
                {displayCount}/{filteredUnselectedTags.length}
              </span>
            </div>
          )}

          {/* 검색 결과 개수 */}
          {searchQuery && <span className="text-xs text-gray-500" aria-live="polite">{totalFiltered}개 결과</span>}
        </div>

        <TagSearchInput value={searchQuery} onChange={handleSearchChange} onClear={() => handleSearchChange('')} />
      </div>

      {/* 태그 영역 */}
      <div className="space-y-3">
        {/* 선택된 태그 (상단 고정) */}
        {selectedTagsData.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-800/50" role="group" aria-label="선택된 태그">
            {selectedTagsData.map(({ tag, count }) => (
              <TagButton key={tag} tag={tag} count={count} isSelected onClick={() => onToggle(tag)} />
            ))}
          </div>
        )}

        {/* 미선택 태그 */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="태그 필터">
          {displayedTags.map(({ tag, count }, index) => {
            const isNew = index >= displayCount - loadMoreCount;
            return (
              <TagButton
                key={tag}
                tag={tag}
                count={count}
                isSelected={false}
                onClick={() => onToggle(tag)}
                isNewlyAdded={isNew}
                animationDelay={isNew ? (index - (displayCount - loadMoreCount)) * ANIMATION_STAGGER_MS : 0}
              />
            );
          })}
        </div>

        {/* 검색 결과 없음 상태 */}
        {filteredUnselectedTags.length === 0 && searchQuery && (
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

      {/* 하단: 접기 + 더보기 버튼 */}
      <div className="flex items-center justify-center gap-3 pt-2">
        {/* 접기 버튼 */}
        {displayCount > initialCount && (
          <button
            type="button"
            onClick={handleReset}
            className="group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-500 hover:text-emerald-400 active:text-emerald-500 transition-all"
            aria-label="태그 목록 접기"
          >
            <span>접기</span>
            <Icons.ChevronDown className="w-3.5 h-3.5 rotate-180 group-hover:translate-y-0.5 transition-transform" />
          </button>
        )}

        {/* 더보기 버튼 - 개선된 UX */}
        {hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            aria-label={`${nextLoadCount}개 태그 더 보기 (전체 ${remainingCount}개 남음)`}
            className={cn(
              'group relative px-5 py-2.5 text-xs font-medium rounded-xl overflow-hidden',
              'bg-gradient-to-br from-gray-800/60 to-gray-800/40 backdrop-blur-sm border border-gray-700/50',
              'hover:from-gray-800/80 hover:to-gray-800/60 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5',
              'active:from-gray-800/90 active:to-gray-800/70 active:border-emerald-500/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
              'transition-all duration-300',
              'animate-fade-in-up'
            )}
            style={{ animationDelay: '200ms' }}
          >
            {/* 호버 글로우 효과 */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

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