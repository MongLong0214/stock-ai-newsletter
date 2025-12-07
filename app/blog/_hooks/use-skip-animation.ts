'use client';

import { useEffect, useState } from 'react';

const VISITED_KEY = 'blog-list-visited';

/**
 * 블로그 리스트 페이지 재방문(뒤로가기 등) 시 애니메이션을 건너뛰어야 하는지 판단
 * - 첫 방문: 애니메이션 표시 (false 반환)
 * - 재방문/뒤로가기: 애니메이션 건너뛰기 (true 반환)
 */
export function useSkipAnimation(): boolean {
  const [shouldSkip, setShouldSkip] = useState(true); // SSR에서는 기본적으로 skip

  useEffect(() => {
    // 방법 1: Navigation API (모던 브라우저)
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const navigationType = navEntries[0]?.type;

    // 방법 2: sessionStorage로 페이지 방문 여부 확인
    const hasVisited = sessionStorage.getItem(VISITED_KEY) === 'true';

    // back_forward 네비게이션이거나 이미 방문한 경우 애니메이션 건너뛰기
    const isBackForward = navigationType === 'back_forward';

    if (isBackForward || hasVisited) {
      setShouldSkip(true);
    } else {
      setShouldSkip(false);
      // 첫 방문 시 마킹 (약간의 딜레이로 애니메이션 완료 후 마킹)
      const timer = setTimeout(() => {
        sessionStorage.setItem(VISITED_KEY, 'true');
      }, 100);
      return () => clearTimeout(timer);
    }

    // pageshow 이벤트로 bfcache 복원 감지
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setShouldSkip(true);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return shouldSkip;
}
