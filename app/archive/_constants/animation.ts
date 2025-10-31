/**
 * 애니메이션 상수
 *
 * 중앙화된 애니메이션 타이밍 및 이징 시스템
 * 애플리케이션 전체에 일관된 모션 디자인 보장
 */

/**
 * 표준 애니메이션 지속시간 (초 단위)
 */
export const DURATION = {
  /** 빠른 피드백 (200ms) */
  fast: 0.2,

  /** 표준 전환 (300ms) */
  normal: 0.3,

  /** 콘텐츠 애니메이션 (500ms) */
  slow: 0.5,
} as const;

/**
 * 표준 이징 함수
 */
export const EASING = {
  /** 부드러운 가속 및 감속 */
  smooth: [0.19, 1, 0.22, 1] as const,
} as const;

/**
 * 스태거 애니메이션 타이밍
 */
const STAGGER = {
  /** 아이템 간 기본 지연 (150ms) */
  delay: 0.15,
} as const;

/**
 * 리스트 아이템 애니메이션을 위한 스태거 지연 계산
 *
 * @param index - 리스트 내 아이템 인덱스
 * @param childDelay - 자식 요소를 위한 추가 지연 (기본값: 0)
 * @returns 초 단위 총 애니메이션 지연
 */
export function getStaggerDelay(index: number, childDelay = 0): number {
  return index * STAGGER.delay + childDelay;
}