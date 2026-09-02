/**
 * SEO 기본 설정
 * 단일 진실 공급원(Single Source of Truth)
 * 여기만 수정하면 전체 사이트에 반영됩니다
 */

import type { SiteConfig } from './types';
import { DELIVERY_TIME_DISPLAY, DELIVERY_TIME_SHORT } from '../delivery';

type OgVersionEnv = Record<string, string | undefined>;

export const siteConfig: SiteConfig = {
  domain: 'https://stockmatrix.co.kr',
  serviceName: 'StockMatrix',
  serviceNameKo: '스탁매트릭스',
  deliveryTime: DELIVERY_TIME_DISPLAY,
  deliveryTimeShort: DELIVERY_TIME_SHORT,
  stockCount: 3,
  indicatorCount: 30,
  markets: 'KOSPI·KOSDAQ',
  // 활성 테마 실측은 239개(2026-09-02)이며, 이 값은 DB 조회가 불가능한 정적 메타데이터용 하한이다.
  // 자동 활성/비활성으로 소폭 변동하므로 실측보다 낮게 둔다.
  // 하한을 올릴 때는 활성 테마 수를 다시 실측하고 이 한 곳만 수정한다.
  themeCountFloor: 230,
} as const;

export function resolveOgImageVersion(env: OgVersionEnv): string {
  const explicitOverride =
    env.NEXT_PUBLIC_OG_IMAGE_VERSION || env.OG_IMAGE_VERSION;

  if (explicitOverride) {
    return explicitOverride;
  }

  const deployIdentifier =
    env.VERCEL_GIT_COMMIT_SHA ||
    env.VERCEL_DEPLOYMENT_ID ||
    env.GITHUB_SHA ||
    env.CF_PAGES_COMMIT_SHA ||
    env.VERCEL_URL;

  if (!deployIdentifier) {
    return 'dev-og';
  }

  const normalized = deployIdentifier.replace(/[^a-zA-Z0-9-]/g, '');
  return normalized.slice(0, 12) || 'dev-og';
}

/** OG/Twitter 이미지 캐시 버스팅용 버전 */
export const OG_IMAGE_VERSION = resolveOgImageVersion(process.env);

/** 외부 크롤러 캐시를 깨기 위해 이미지 URL에 버전 쿼리 부여 */
export function withOgImageVersion(pathOrUrl: string): string {
  const separator = pathOrUrl.includes('?') ? '&' : '?';
  return `${pathOrUrl}${separator}v=${OG_IMAGE_VERSION}`;
}

/**
 * Schema.org @id 체계 — 엔티티 그래프 상호참조용
 * Google Search Central: Organization → WebSite → WebPage → Article 체인 필수
 */
export const schemaIds = {
  organization: `${siteConfig.domain}/#organization`,
  website: `${siteConfig.domain}/#website`,
  service: `${siteConfig.domain}/#service`,
  pageId: (path: string) => `${siteConfig.domain}${path.replace(/\/$/, '')}/#webpage`,
  articleId: (path: string) => `${siteConfig.domain}${path.replace(/\/$/, '')}/#article`,
} as const;

/** ISO 8601 KST timezone suffix */
export const KST_TIMEZONE = '+09:00';

/** datePublished/dateModified에 KST timezone 보장 */
export function ensureKSTTimezone(dateStr: string | null): string | null {
  if (!dateStr) return null;
  if (dateStr.includes('+') || dateStr.includes('Z')) return dateStr;
  return `${dateStr}${KST_TIMEZONE}`;
}
