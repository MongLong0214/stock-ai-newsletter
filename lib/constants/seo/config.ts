/**
 * SEO 기본 설정
 * 단일 진실 공급원(Single Source of Truth)
 * 여기만 수정하면 전체 사이트에 반영됩니다
 */

import type { SiteConfig } from './types';
import { DELIVERY_TIME_DISPLAY, DELIVERY_TIME_SHORT } from '../delivery';

export const siteConfig: SiteConfig = {
  domain: 'https://stockmatrix.co.kr',
  serviceName: 'Stock Matrix',
  serviceNameKo: '스탁매트릭스',
  deliveryTime: DELIVERY_TIME_DISPLAY,
  deliveryTimeShort: DELIVERY_TIME_SHORT,
  stockCount: 3,
  indicatorCount: 30,
  markets: 'KOSPI·KOSDAQ',
} as const;

/**
 * Schema.org @id 체계 — 엔티티 그래프 상호참조용
 * Google Search Central: Organization → WebSite → WebPage → Article 체인 필수
 */
export const schemaIds = {
  organization: `${siteConfig.domain}/#organization`,
  website: `${siteConfig.domain}/#website`,
  service: `${siteConfig.domain}/#service`,
  pageId: (path: string) => `${siteConfig.domain}${path}/#webpage`,
  articleId: (path: string) => `${siteConfig.domain}${path}/#article`,
} as const;

/** ISO 8601 KST timezone suffix */
export const KST_TIMEZONE = '+09:00';

/** datePublished/dateModified에 KST timezone 보장 */
export function ensureKSTTimezone(dateStr: string | null): string | null {
  if (!dateStr) return null;
  if (dateStr.includes('+') || dateStr.includes('Z')) return dateStr;
  return `${dateStr}${KST_TIMEZONE}`;
}