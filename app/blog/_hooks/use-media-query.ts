import { useState, useEffect, useCallback } from 'react';

/**
 * Tailwind CSS breakpoint 정의
 * @see https://tailwindcss.com/docs/responsive-design
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * 미디어 쿼리 훅 - SSR-safe 반응형 처리
 *
 * @param query - CSS 미디어 쿼리 문자열 (예: '(min-width: 768px)')
 * @param defaultValue - SSR 및 초기 렌더링 시 기본값 (hydration mismatch 방지)
 * @returns 미디어 쿼리 매칭 여부
 *
 * @example
 * const isDesktop = useMediaQuery('(min-width: 768px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    // SSR 환경 체크
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);

    // 초기값 설정 (클라이언트 마운트 시)
    setMatches(mediaQuery.matches);

    // 변경 이벤트 핸들러
    const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/**
 * Breakpoint 기반 반응형 훅 - Tailwind breakpoint 직접 사용
 *
 * @param breakpoint - Tailwind breakpoint 이름 ('sm' | 'md' | 'lg' | 'xl' | '2xl')
 * @param defaultValue - SSR 기본값 (모바일 우선: false 권장)
 * @returns 해당 breakpoint 이상인지 여부
 *
 * @example
 * const isMd = useBreakpoint('md');  // >= 768px
 * const isLg = useBreakpoint('lg');  // >= 1024px
 */
export function useBreakpoint(breakpoint: Breakpoint, defaultValue = false): boolean {
  const query = `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
  return useMediaQuery(query, defaultValue);
}

/**
 * 반응형 값 훅 - breakpoint에 따라 다른 값 반환
 *
 * @param breakpoint - 기준 breakpoint
 * @param values - { mobile: 모바일 값, desktop: 데스크톱 값 }
 * @returns breakpoint 이상이면 desktop 값, 미만이면 mobile 값
 *
 * @example
 * const displayCount = useResponsiveValue('md', { mobile: 6, desktop: 12 });
 */
export function useResponsiveValue<T>(
  breakpoint: Breakpoint,
  values: { mobile: T; desktop: T }
): T {
  const isAboveBreakpoint = useBreakpoint(breakpoint, false);
  return isAboveBreakpoint ? values.desktop : values.mobile;
}

/**
 * 반응형 콜백 훅 - breakpoint 변경 시 콜백 실행
 *
 * @param breakpoint - 감지할 breakpoint
 * @param onDesktop - 데스크톱 진입 시 콜백
 * @param onMobile - 모바일 진입 시 콜백
 *
 * @example
 * useBreakpointEffect('md', {
 *   onDesktop: () => setDisplayCount(12),
 *   onMobile: () => setDisplayCount(6),
 * });
 */
export function useBreakpointEffect(
  breakpoint: Breakpoint,
  callbacks: {
    onDesktop?: () => void;
    onMobile?: () => void;
  }
): void {
  const isAboveBreakpoint = useBreakpoint(breakpoint, false);

  // 콜백을 안정화
  const stableOnDesktop = useCallback(() => callbacks.onDesktop?.(), [callbacks.onDesktop]);
  const stableOnMobile = useCallback(() => callbacks.onMobile?.(), [callbacks.onMobile]);

  useEffect(() => {
    if (isAboveBreakpoint) {
      stableOnDesktop();
    } else {
      stableOnMobile();
    }
  }, [isAboveBreakpoint, stableOnDesktop, stableOnMobile]);
}