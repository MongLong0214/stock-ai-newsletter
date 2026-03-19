import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GA_MEASUREMENT_ID를 테스트에서 설정
vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');

// 각 테스트에서 모듈을 fresh import하기 위해 캐시 리셋
beforeEach(() => {
  vi.resetModules();
});

// window/document/dataLayer 모킹
const originalWindow = globalThis.window;

function setupWindowMock(gtagReady = false) {
  const dataLayer: unknown[] = [];
  const gtagFn = gtagReady
    ? vi.fn()
    : undefined;

  Object.defineProperty(globalThis, 'window', {
    value: {
      dataLayer,
      gtag: gtagFn,
      location: { origin: 'https://stockmatrix.co.kr' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, 'document', {
    value: { title: 'Test Page' },
    writable: true,
    configurable: true,
  });

  return { dataLayer, gtagFn };
}

function cleanupWindowMock() {
  Object.defineProperty(globalThis, 'window', {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
}

describe('waitForGtag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanupWindowMock();
  });

  it('resolves true immediately when gtag is ready', async () => {
    setupWindowMock(true);
    // Dynamic import to pick up mocked window
    const { waitForGtag } = await import('@/lib/analytics/ga');
    const result = waitForGtag();
    expect(await result).toBe(true);
  });

  it('resolves false after 3s timeout', async () => {
    setupWindowMock(false);
    const { waitForGtag } = await import('@/lib/analytics/ga');
    const promise = waitForGtag(3000);
    vi.advanceTimersByTime(3100);
    expect(await promise).toBe(false);
  });

  it('polls at 100ms intervals', async () => {
    setupWindowMock(false);
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { waitForGtag } = await import('@/lib/analytics/ga');
    waitForGtag();
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 100);
    spy.mockRestore();
  });
});

describe('pageview dataLayer fallback', () => {
  afterEach(() => {
    cleanupWindowMock();
  });

  it('queues to dataLayer when gtag is not ready', async () => {
    const { dataLayer } = setupWindowMock(false);
    vi.useFakeTimers();

    const { pageview } = await import('@/lib/analytics/ga');
    const promise = pageview('/test-path');
    vi.advanceTimersByTime(3100);
    await promise;

    expect(dataLayer.some(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        'event' in entry &&
        (entry as Record<string, unknown>).event === 'page_view'
    )).toBe(true);

    vi.useRealTimers();
  });

  it('enforces dataLayer max 50 entries', async () => {
    const { dataLayer } = setupWindowMock(false);
    // Fill with 50 entries
    for (let i = 0; i < 50; i++) {
      dataLayer.push({ event: `dummy_${i}` });
    }
    expect(dataLayer.length).toBe(50);

    vi.useFakeTimers();
    const { pageview } = await import('@/lib/analytics/ga');
    const promise = pageview('/overflow');
    vi.advanceTimersByTime(3100);
    await promise;

    expect(dataLayer.length).toBeLessThanOrEqual(50);
    vi.useRealTimers();
  });
});

describe('setupBFCacheHandler', () => {
  afterEach(() => {
    cleanupWindowMock();
  });

  it('registers pageshow event listener', async () => {
    setupWindowMock(true);
    const { setupBFCacheHandler } = await import('@/lib/analytics/ga');
    setupBFCacheHandler();
    expect(window.addEventListener).toHaveBeenCalledWith(
      'pageshow',
      expect.any(Function)
    );
  });

  it('returns cleanup function that removes listener', async () => {
    setupWindowMock(true);
    const { setupBFCacheHandler } = await import('@/lib/analytics/ga');
    const cleanup = setupBFCacheHandler();
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'pageshow',
      expect.any(Function)
    );
  });
});

describe('setupScrollDepthTracking', () => {
  afterEach(() => {
    cleanupWindowMock();
  });

  it('registers scroll event listener with passive option', async () => {
    setupWindowMock(true);
    const { setupScrollDepthTracking } = await import('@/lib/analytics/ga');
    setupScrollDepthTracking();
    expect(window.addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true }
    );
  });

  it('returns cleanup function', async () => {
    setupWindowMock(true);
    const { setupScrollDepthTracking } = await import('@/lib/analytics/ga');
    const cleanup = setupScrollDepthTracking();
    cleanup();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function)
    );
  });

  it('returns noop in non-browser environment', async () => {
    // window가 없는 상태 시뮬레이션
    const originalWindow = globalThis.window;
    // @ts-expect-error — SSR 환경 시뮬레이션
    delete globalThis.window;

    const { setupScrollDepthTracking } = await import('@/lib/analytics/ga');
    const cleanup = setupScrollDepthTracking();
    expect(typeof cleanup).toBe('function');
    cleanup(); // should not throw

    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    });
  });
});
