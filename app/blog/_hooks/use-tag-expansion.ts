/**
 * 태그 확장 상태 관리 훅
 * - 반응형 초기 표시 개수 지원
 * - 검색어 debounce로 성능 최적화
 * - SSR-safe hydration
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
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
  displayCount: number;
  prevDisplayCount: number;
  isExpanded: boolean;
  isReady: boolean;
  searchQuery: string;
  debouncedSearchQuery: string;
  loadMoreCount: number;
  expand: () => void;
  collapse: () => void;
  setSearchQuery: (query: string) => void;
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
  const [isReady, setIsReady] = useState(false);

  // Hydration 완료 감지
  useEffect(() => {
    setIsReady(true);
  }, []);

  // 검색어 debounce (150ms)
  const debouncedSearchQuery = useDebounce(
    searchQuery,
    TAG_EXPANSION_CONFIG.SEARCH_DEBOUNCE_MS
  );

  // 표시할 태그 개수 계산
  const displayCount = useMemo(
    () => calculateDisplayCount(level, initialCount, loadMoreCount, totalCount),
    [level, initialCount, loadMoreCount, totalCount]
  );

  // 이전 레벨의 표시 개수 (애니메이션 시작점)
  const prevDisplayCount = useMemo(
    () => level > 0 ? calculateDisplayCount(level - 1, initialCount, loadMoreCount, totalCount) : 0,
    [level, initialCount, loadMoreCount, totalCount]
  );

  const isExpanded = level > 0;

  // 핸들러들 - 모두 useCallback으로 안정화
  const expand = useCallback(() => {
    // setTimeout으로 다음 틱에서 실행하여 React 배칭 이슈 방지
    setTimeout(() => {
      setLevel((prev) => prev + 1);
    }, 0);
  }, []);

  const collapse = useCallback(() => {
    setTimeout(() => {
      setLevel(0);
      setSearchQueryState('');
    }, 0);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setTimeout(() => {
      setSearchQueryState(query);
      setLevel(0);
    }, 0);
  }, []);

  const clearSearch = useCallback(() => {
    setTimeout(() => {
      setSearchQueryState('');
      setLevel(0);
    }, 0);
  }, []);

  return {
    displayCount,
    prevDisplayCount,
    isExpanded,
    isReady,
    searchQuery,
    debouncedSearchQuery,
    loadMoreCount,
    expand,
    collapse,
    setSearchQuery,
    clearSearch,
  };
}
