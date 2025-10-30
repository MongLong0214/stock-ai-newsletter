/**
 * 모션 감소 훅
 *
 * 접근성을 위해 사용자의 모션 설정 존중
 * WCAG 2.1 성공 기준 2.3.3 (인터랙션으로부터의 애니메이션) 구현
 *
 * 사용자는 OS에서 "모션 감소" 활성화 가능:
 * - macOS: 시스템 환경설정 > 접근성 > 디스플레이 > 움직이는 효과 줄이기
 * - Windows: 설정 > 접근성 > 디스플레이 > 애니메이션 표시
 * - iOS: 설정 > 접근성 > 동작 > 시차 효과 줄이기
 */

import { useEffect, useState } from 'react';

/**
 * 사용자가 모션 감소를 선호하는지 감지하는 훅
 *
 * 사용자가 OS 설정에서 "prefers-reduced-motion"을 활성화한 경우 true 반환
 * 사용자가 설정을 변경할 때 자동으로 업데이트됨
 *
 * @returns 모션 감소 선호 여부를 나타내는 boolean
 *
 * @example
 * const shouldReduceMotion = useReducedMotion();
 *
 * <motion.div
 *   initial={shouldReduceMotion ? false : { opacity: 0 }}
 *   animate={shouldReduceMotion ? false : { opacity: 1 }}
 * />
 */
export function useReducedMotion(): boolean {
  // 서버 사이드 렌더링: 기본값으로 모션 감소 없음
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // matchMedia가 지원되는지 확인 (일부 구형 브라우저에서 사용 불가)
    if (!window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // 초기값 설정
    setPrefersReducedMotion(mediaQuery.matches);

    // 사용자가 설정을 변경할 때 값 업데이트
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // 최신 브라우저는 MediaQueryList에서 addEventListener 지원
    mediaQuery.addEventListener('change', handleChange);

    // 정리
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

/**
 * 모션 감소 설정을 존중하는 애니메이션 props 반환
 *
 * 사용자 설정에 따라 애니메이션 props 또는 false 반환하는 헬퍼 함수
 *
 * @param shouldReduce - 모션 감소 선호 여부
 * @param animationProps - 모션이 허용될 때 사용할 애니메이션 속성
 * @returns 애니메이션 props 또는 false
 *
 * @example
 * const shouldReduceMotion = useReducedMotion();
 *
 * <motion.div
 *   {...getAnimationProps(shouldReduceMotion, {
 *     initial: { opacity: 0, y: 20 },
 *     animate: { opacity: 1, y: 0 }
 *   })}
 * />
 */
export function getAnimationProps<T>(
  shouldReduce: boolean,
  animationProps: T
): T | false {
  return shouldReduce ? false : animationProps;
}

export default useReducedMotion;
