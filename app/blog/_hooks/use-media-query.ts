import { useState, useEffect } from 'react';

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
 * SSR-safe 미디어 쿼리 훅
 * @param query CSS 미디어 쿼리 (예: '(min-width: 768px)')
 * @param defaultValue SSR/초기 렌더링 기본값 (hydration mismatch 방지)
 * @example
 * const isDesktop = useMediaQuery('(min-width: 768px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => setMatches(e.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/**
 * Tailwind breakpoint 기반 반응형 훅
 * @param breakpoint Tailwind breakpoint ('sm' | 'md' | 'lg' | 'xl' | '2xl')
 * @param defaultValue SSR 기본값 (모바일 우선: false 권장)
 * @example
 * const isMd = useBreakpoint('md'); // >= 768px
 */
export function useBreakpoint(breakpoint: Breakpoint, defaultValue = false): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS[breakpoint]}px)`, defaultValue);
}

/**
 * Breakpoint 기반 반응형 값 선택 훅
 * @param breakpoint 기준 breakpoint
 * @param values mobile/desktop 값 객체
 * @example
 * const itemCount = useResponsiveValue('md', { mobile: 6, desktop: 12 });
 */
export function useResponsiveValue<T>(
  breakpoint: Breakpoint,
  values: { mobile: T; desktop: T }
): T {
  const isAboveBreakpoint = useBreakpoint(breakpoint, false);
  return isAboveBreakpoint ? values.desktop : values.mobile;
}