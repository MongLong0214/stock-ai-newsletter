export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export interface GA4Item {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_category2?: string;
  item_list_id?: string;
  item_list_name?: string;
  index?: number;
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (
      command: 'config' | 'event',
      targetIdOrEventName: string,
      params?: Record<string, string | number | boolean | GA4Item[]>
    ) => void;
  }
}

type EventParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | GA4Item[];

type EventParams = Record<string, EventParamValue>;

function cleanParams(params: EventParams = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
  ) as Record<string, string | number | boolean | GA4Item[]>;
}

function canTrack() {
  return Boolean(
    GA_MEASUREMENT_ID &&
      typeof window !== 'undefined' &&
      typeof window.gtag === 'function'
  );
}

const DATALAYER_MAX = 50;

export function waitForGtag(maxWaitMs = 3000): Promise<boolean> {
  if (canTrack()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (canTrack()) {
        clearInterval(timer);
        resolve(true);
      } else if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, interval);
  });
}

export async function pageview(path: string) {
  if (!GA_MEASUREMENT_ID) return;

  const ready = canTrack() || (await waitForGtag());

  if (!ready) {
    // gtag 미로드 시 dataLayer 큐잉 — gtag 로드 후 자동 처리
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      if (window.dataLayer.length >= DATALAYER_MAX) window.dataLayer.shift();
      window.dataLayer.push({
        event: 'page_view',
        page_path: path,
        page_title: document.title,
        page_location: `${window.location.origin}${path}`,
      });
    }
    return;
  }

  window.gtag?.('config', GA_MEASUREMENT_ID, {
    page_path: path,
    page_title: document.title,
    page_location: `${window.location.origin}${path}`,
  });
}

export function setupBFCacheHandler(): () => void {
  const handler = (event: PageTransitionEvent) => {
    if (event.persisted) {
      pageview(window.location.pathname + window.location.search);
    }
  };
  window.addEventListener('pageshow', handler);
  return () => window.removeEventListener('pageshow', handler);
}

export function trackEvent(eventName: string, params: EventParams = {}) {
  if (!canTrack()) return;

  window.gtag?.('event', eventName, cleanParams(params));
}

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

export function setupScrollDepthTracking(): () => void {
  if (typeof window === 'undefined') return () => {};

  const fired = new Set<number>();

  const handler = () => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return;

    const percent = Math.round((window.scrollY / scrollHeight) * 100);

    for (const threshold of SCROLL_THRESHOLDS) {
      if (percent >= threshold && !fired.has(threshold)) {
        fired.add(threshold);
        trackEvent('scroll_depth', {
          percent_scrolled: threshold,
          page_path: window.location.pathname,
        });
      }
    }
  };

  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}

export function buildThemeItem({
  id,
  name,
  stage,
  index,
  listId,
  listName,
}: {
  id: string;
  name: string;
  stage?: string | null;
  index?: number;
  listId?: string;
  listName?: string;
}): GA4Item {
  return {
    item_id: id,
    item_name: name,
    item_category: 'stock_theme',
    ...(stage ? { item_category2: stage } : {}),
    ...(typeof index === 'number' ? { index } : {}),
    ...(listId ? { item_list_id: listId } : {}),
    ...(listName ? { item_list_name: listName } : {}),
  };
}
