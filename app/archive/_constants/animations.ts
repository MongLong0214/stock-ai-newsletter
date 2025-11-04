/**
 * 아카이브 페이지 애니메이션 설정
 *
 * 중앙화된 애니메이션 타이밍 및 이징 시스템
 * 애플리케이션 전체에 일관된 모션 디자인 보장
 */

/** 표준 이징 함수 */
export const EASE_OUT_CUBIC = [0.25, 0.46, 0.45, 0.94] as const;
export const EASE_OUT_EXPO = [0.19, 1, 0.22, 1] as const;

/** 애니메이션 지속 시간 (초 단위) */
export const DURATION = {
  /** 빠른 전환 (300ms) */
  fast: 0.3,
  /** 표준 전환 (400ms) */
  normal: 0.4,
  /** 느린 콘텐츠 애니메이션 (500ms) */
  slow: 0.5,
} as const;

/**
 * 페이드인 + 위로 이동 애니메이션 생성
 *
 * @param delay - 애니메이션 지연 시간 (초)
 * @returns Framer Motion 애니메이션 props
 */
export const createFadeInUpVariant = (delay: number = 0) => ({
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.normal, delay, ease: EASE_OUT_CUBIC },
});

/** 페이지 요소별 스태거 애니메이션 딜레이 */
export const STAGGER_DELAYS = {
  header: 0,
  title: 0.1,
  description: 0.2,
  sidebar: 0.3,
  content: 0.4,
} as const;

/**
 * 카드 그리드 스태거 딜레이 계산
 *
 * @param index - 카드 인덱스
 * @param baseDelay - 기본 딜레이 (기본값: 0.3초)
 * @returns 계산된 딜레이 시간 (초)
 */
export const calculateCardDelay = (index: number, baseDelay: number = 0.3) => {
  return baseDelay + index * 0.1;
};