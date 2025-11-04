/**
 * 애니메이션 설정 상수
 *
 * Framer Motion 애니메이션의 일관성을 위한 중앙 집중식 설정
 */

/** 공통 easing 함수 */
export const EASE_OUT_CUBIC = [0.25, 0.46, 0.45, 0.94] as const;

/** 애니메이션 duration */
export const DURATION = 0.4;

/** Fade-in 애니메이션 variants */
export const createFadeInVariant = (delay: number) => ({
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: DURATION,
    delay,
    ease: EASE_OUT_CUBIC,
  },
});

/** 페이드인 애니메이션 delay 설정 */
export const ANIMATION_DELAYS = {
  header: 0,
  indicatorsGrid: 0.1,
  aiIntegration: 0.2,
  conclusion: 0.3,
} as const;