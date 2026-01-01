/**
 * 태그 관련 유틸리티 함수
 * - 순수 함수로 구성되어 단위 테스트 용이
 * - 컴포넌트와 분리된 비즈니스 로직
 */

// ============================================================================
// 타입
// ============================================================================

export interface TagData {
  tag: string;
  count: number;
}

export interface PartitionedTags {
  selected: TagData[];
  unselected: TagData[];
}

// ============================================================================
// 함수
// ============================================================================

/**
 * 태그 배열을 선택/미선택으로 분리
 * @param tags - 전체 태그 배열
 * @param selectedTags - 선택된 태그 Set
 * @returns 선택된 태그와 미선택 태그로 분리된 객체
 * @example
 * const { selected, unselected } = partitionTags(tags, new Set(['react']));
 */
export function partitionTags(
  tags: TagData[],
  selectedTags: Set<string>
): PartitionedTags {
  const selected: TagData[] = [];
  const unselected: TagData[] = [];

  for (const item of tags) {
    if (selectedTags.has(item.tag)) {
      selected.push(item);
    } else {
      unselected.push(item);
    }
  }

  return { selected, unselected };
}

/**
 * 검색어로 태그 필터링
 * @param tags - 필터링할 태그 배열
 * @param query - 검색어 (대소문자 무시)
 * @returns 검색어를 포함하는 태그 배열
 * @example
 * const filtered = filterTagsByQuery(tags, 'react');
 */
export function filterTagsByQuery(tags: TagData[], query: string): TagData[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return tags;

  const lowerQuery = trimmedQuery.toLowerCase();
  return tags.filter(({ tag }) => tag.toLowerCase().includes(lowerQuery));
}

/**
 * 표시할 태그 개수 계산
 * @param level - 확장 레벨 (0 = 초기, 1 = 1단계 확장, ...)
 * @param initialCount - 초기 표시 개수
 * @param loadMoreCount - 더보기 시 추가 개수
 * @param totalCount - 전체 태그 개수
 * @returns 표시할 태그 개수
 */
export function calculateDisplayCount(
  level: number,
  initialCount: number,
  loadMoreCount: number,
  totalCount: number
): number {
  const count = initialCount + level * loadMoreCount;
  return Math.min(count, totalCount);
}
