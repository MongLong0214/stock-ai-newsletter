/**
 * 태그 확장 상태 관리 훅
 * - useTransition으로 UI 블로킹 방지
 * - 레벨 기반 점진적 확장
 */
import { useState, useMemo, useCallback, useTransition } from 'react';

// ============================================================================
// 설정
// ============================================================================

export const TAG_EXPANSION_CONFIG = {
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

interface ExpandState {
  /** 확장 레벨 (0 = 접힌 상태, 1 = 1단계 확장, ...) */
  level: number;
  /** 검색어 */
  searchQuery: string;
}

interface UseTagExpansionReturn {
  /** 현재 표시할 태그 개수 */
  displayCount: number;
  /** 더 표시할 태그가 있는지 */
  hasMore: boolean;
  /** 확장되었는지 (접기 버튼 표시 여부) */
  isExpanded: boolean;
  /** 현재 검색어 */
  searchQuery: string;
  /** 상태 변경 중인지 */
  isPending: boolean;
  /** 더보기 */
  expand: () => void;
  /** 접기 */
  collapse: () => void;
  /** 검색어 변경 */
  setSearchQuery: (query: string) => void;
}

// ============================================================================
// 훅
// ============================================================================

export function useTagExpansion(totalCount: number): UseTagExpansionReturn {
  const [state, setState] = useState<ExpandState>({ level: 0, searchQuery: '' });
  const [isPending, startTransition] = useTransition();

  /** 현재 표시해야 할 태그 개수 계산 */
  const displayCount = useMemo(() => {
    const base = TAG_EXPANSION_CONFIG.INITIAL_COUNT;
    const additional = state.level * TAG_EXPANSION_CONFIG.LOAD_MORE_COUNT;
    return Math.min(base + additional, totalCount);
  }, [state.level, totalCount]);

  /** 더 표시할 태그가 있는지 */
  const hasMore = displayCount < totalCount;

  /** 확장되었는지 */
  const isExpanded = state.level > 0;

  /** 더보기 */
  const expand = useCallback(() => {
    startTransition(() => {
      setState(prev => ({ ...prev, level: prev.level + 1 }));
    });
  }, []);

  /** 접기 */
  const collapse = useCallback(() => {
    startTransition(() => {
      setState({ level: 0, searchQuery: '' });
    });
  }, []);

  /** 검색어 변경 */
  const setSearchQuery = useCallback((query: string) => {
    startTransition(() => {
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
