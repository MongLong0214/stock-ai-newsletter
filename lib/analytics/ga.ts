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

export function pageview(path: string) {
  if (!canTrack() || !GA_MEASUREMENT_ID) return;

  window.gtag?.('config', GA_MEASUREMENT_ID, {
    page_path: path,
    page_title: document.title,
    page_location: `${window.location.origin}${path}`,
  });
}

export function trackEvent(eventName: string, params: EventParams = {}) {
  if (!canTrack()) return;

  window.gtag?.('event', eventName, cleanParams(params));
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
