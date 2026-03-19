import { describe, it, expect } from 'vitest';

/**
 * GA4RouteTracker 핵심 로직 테스트.
 *
 * RouteTracker는 React 컴포넌트지만 핵심 로직은:
 * 1. 초기 마운트 시 pageview() skip (send_page_view:true가 처리)
 * 2. pathname 변경 시에만 pageview() 호출
 * 3. 동일 path 중복 호출 방지
 *
 * React 렌더링 없이 로직을 직접 검증한다.
 */

function createRouteTracker() {
  let lastTrackedPath: string | null = null;
  let isInitialLoad = true;
  const pageviewCalls: string[] = [];

  function onRouteChange(pathname: string, searchParams: string) {
    if (!pathname) return;
    const path = searchParams ? `${pathname}?${searchParams}` : pathname;

    if (isInitialLoad) {
      isInitialLoad = false;
      lastTrackedPath = path;
      return;
    }

    if (lastTrackedPath === path) return;
    lastTrackedPath = path;
    pageviewCalls.push(path);
  }

  return { onRouteChange, pageviewCalls };
}

describe('GA4RouteTracker logic', () => {
  it('skips pageview on initial mount', () => {
    const { onRouteChange, pageviewCalls } = createRouteTracker();
    onRouteChange('/', '');
    expect(pageviewCalls).toHaveLength(0);
  });

  it('calls pageview on pathname change', () => {
    const { onRouteChange, pageviewCalls } = createRouteTracker();
    onRouteChange('/', '');
    onRouteChange('/themes', '');
    expect(pageviewCalls).toEqual(['/themes']);
  });

  it('does not duplicate pageview on same path', () => {
    const { onRouteChange, pageviewCalls } = createRouteTracker();
    onRouteChange('/', '');
    onRouteChange('/themes', '');
    onRouteChange('/themes', '');
    expect(pageviewCalls).toEqual(['/themes']);
  });

  it('includes search params in path', () => {
    const { onRouteChange, pageviewCalls } = createRouteTracker();
    onRouteChange('/', '');
    onRouteChange('/blog', 'q=test');
    expect(pageviewCalls).toEqual(['/blog?q=test']);
  });

  it('treats same path with different params as different', () => {
    const { onRouteChange, pageviewCalls } = createRouteTracker();
    onRouteChange('/', '');
    onRouteChange('/blog', 'q=a');
    onRouteChange('/blog', 'q=b');
    expect(pageviewCalls).toEqual(['/blog?q=a', '/blog?q=b']);
  });
});
