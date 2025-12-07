'use client';

import { useEffect, useState } from 'react';

/**
 * 블로그 리스트 페이지에서 애니메이션을 건너뛰어야 하는지 판단
 *
 * 다음 경우 애니메이션 건너뛰기 (빈 화면 방지):
 * - 뒤로가기/앞으로가기 (back_forward)
 * - 새로고침 (reload) - 브라우저가 스크롤 위치 복원
 * - 스크롤 위치가 이미 0이 아닌 경우
 *
 * 첫 방문 + 스크롤 최상단인 경우만 애니메이션 표시
 */
export function useSkipAnimation(): boolean {
  const [shouldSkip, setShouldSkip] = useState(true); // SSR에서는 기본적으로 skip

  useEffect(() => {
    // Navigation API로 페이지 진입 방식 확인
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const navigationType = navEntries[0]?.type;

    // 뒤로가기/앞으로가기 또는 새로고침인 경우
    const isBackForward = navigationType === 'back_forward';
    const isReload = navigationType === 'reload';

    // 스크롤 위치가 이미 복원된 경우 (0이 아닌 경우)
    const hasScrollPosition = window.scrollY > 0;

    // 위 조건 중 하나라도 해당되면 애니메이션 건너뛰기
    if (isBackForward || isReload || hasScrollPosition) {
      setShouldSkip(true);
    } else {
      setShouldSkip(false);
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
