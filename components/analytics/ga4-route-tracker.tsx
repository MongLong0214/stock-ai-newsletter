'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview, setupBFCacheHandler, setupScrollDepthTracking } from '@/lib/analytics/ga';

export default function GA4RouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!pathname) return;

    const queryString = searchParams.toString();
    const path = queryString ? `${pathname}?${queryString}` : pathname;

    // 초기 로드 skip — gtag config의 send_page_view:true가 첫 page_view를 처리
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      lastTrackedPathRef.current = path;
      return;
    }

    if (lastTrackedPathRef.current === path) return;

    lastTrackedPathRef.current = path;
    pageview(path);
  }, [pathname, searchParams]);

  // BFCache 복원 시 page_view 재발화
  useEffect(() => {
    const cleanup = setupBFCacheHandler();
    return cleanup;
  }, []);

  // 스크롤 깊이 추적 (25/50/75/100%) — 페이지 변경 시 리셋
  useEffect(() => {
    const cleanup = setupScrollDepthTracking();
    return cleanup;
  }, [pathname]);

  return null;
}
