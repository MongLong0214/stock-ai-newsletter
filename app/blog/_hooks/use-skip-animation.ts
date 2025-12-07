'use client';

import { useEffect, useState } from 'react';

type NavigationType = 'navigate' | 'reload' | 'back_forward' | 'prerender';

const SKIP_ANIMATION_TYPES: NavigationType[] = ['back_forward', 'reload'];

/**
 * 페이지 진입 시 애니메이션 표시 여부 결정
 * 스크롤 복원이 일어나는 상황에서 빈 화면 방지
 */
export function useSkipAnimation(): boolean {
  const [shouldSkip, setShouldSkip] = useState(true);

  useEffect(() => {
    const navigationType = getNavigationType();
    const shouldSkipAnimation =
      SKIP_ANIMATION_TYPES.includes(navigationType) || window.scrollY > 0;

    setShouldSkip(shouldSkipAnimation);

    // bfcache 복원 시 처리
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setShouldSkip(true);
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return shouldSkip;
}

function getNavigationType(): NavigationType {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return (entry?.type as NavigationType) ?? 'navigate';
}
