/**
 * 태그 확장 상태 관리 훅
 * - 반응형 초기 표시 개수 지원
 * - 검색어 debounce로 성능 최적화
 * - SSR-safe hydration
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useResponsiveValue } from './use-media-query';
import { useDebounce } from './use-debounce';
import { calculateDisplayCount } from '../_utils/tag-utils';

// ============================================================================
// 설정
// ============================================================================

/** 태그 확장 설정 */
export const TAG_EXPANSION_CONFIG = {
  /** 모바일 초기 표시 개수 */
  MOBILE_INITIAL_COUNT: 6,
  /** 데스크톱 초기 표시 개수 */
  DESKTOP_INITIAL_COUNT: 12,
  /** 모바일 더보기 클릭 시 추가 개수 */
  MOBILE_LOAD_MORE_COUNT: 10,
  /** 데스크톱 더보기 클릭 시 추가 개수 */
  DESKTOP_LOAD_MORE_COUNT: 20,
  /** 애니메이션 stagger 딜레이 (ms) */
  ANIMATION_STAGGER_MS: 15,
  /** 검색 debounce 딜레이 (ms) */
  SEARCH_DEBOUNCE_MS: 150,
} as const;

// ============================================================================
// 타입
// ============================================================================

interface UseTagExpansionOptions {
  /** 필터링된 태그 총 개수 */
  totalCount: number;
}

interface UseTagExpansionReturn {
  /** 현재 표시할 태그 개수 */
  displayCount: number;
  /** 더 표시할 태그가 있는지 */
  hasMore: boolean;
  /** 확장되었는지 (접기 버튼 표시 여부) */
  isExpanded: boolean;
  /** 현재 검색어 (입력값) */
  searchQuery: string;
  /** debounce된 검색어 (필터링에 사용) */
  debouncedSearchQuery: string;
  /** 초기 표시 개수 (반응형) */
  initialCount: number;
  /** 더보기 추가 개수 (반응형) */
  loadMoreCount: number;
  /** 더보기 클릭 핸들러 */
  expand: () => void;
  /** 접기 클릭 핸들러 (검색어도 초기화) */
  collapse: () => void;
  /** 검색어 변경 핸들러 (확장 상태 초기화) */
  setSearchQuery: (query: string) => void;
  /** 검색어 초기화 핸들러 */
  clearSearch: () => void;
}

// ============================================================================
// 훅
// ============================================================================

/**
 * 태그 확장 상태 관리
 * @param options.totalCount - 필터링된 태그 총 개수
 * @returns 확장 상태 및 핸들러
 */
export function useTagExpansion({
  totalCount,
}: UseTagExpansionOptions): UseTagExpansionReturn {
  // 반응형 값들을 한 번에 계산
  const initialCount = useResponsiveValue('md', {
    mobile: TAG_EXPANSION_CONFIG.MOBILE_INITIAL_COUNT,
    desktop: TAG_EXPANSION_CONFIG.DESKTOP_INITIAL_COUNT,
  });

  const loadMoreCount = useResponsiveValue('md', {
    mobile: TAG_EXPANSION_CONFIG.MOBILE_LOAD_MORE_COUNT,
    desktop: TAG_EXPANSION_CONFIG.DESKTOP_LOAD_MORE_COUNT,
  });

  // 상태
  const [level, setLevel] = useState(0);
  const [searchQuery, setSearchQueryState] = useState('');

  // 검색어 debounce (150ms)
  const debouncedSearchQuery = useDebounce(
    searchQuery,
    TAG_EXPANSION_CONFIG.SEARCH_DEBOUNCE_MS
  );

  // 브레이크포인트 변경 시 레벨 리셋
  useEffect(() => {
    setLevel(0);
  }, [initialCount]);

  // 표시할 태그 개수 계산
  const displayCount = useMemo(
    () => calculateDisplayCount(level, initialCount, loadMoreCount, totalCount),
    [level, initialCount, loadMoreCount, totalCount]
  );

  // 파생 상태
  const hasMore = displayCount < totalCount;
  const isExpanded = level > 0;

  // 핸들러들 - 모두 useCallback으로 안정화
  const expand = useCallback(() => {
    setLevel((prev) => prev + 1);
  }, []);

  const collapse = useCallback(() => {
    setLevel(0);
    setSearchQueryState('');
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    setLevel(0);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQueryState('');
    setLevel(0);
  }, []);

  return {
    displayCount,
    hasMore,
    isExpanded,
    searchQuery,
    debouncedSearchQuery,
    initialCount,
    loadMoreCount,
    expand,
    collapse,
    setSearchQuery,
    clearSearch,
  };
}
