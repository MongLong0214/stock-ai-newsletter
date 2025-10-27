/**
 * SEO 기본 설정
 * 단일 진실 공급원(Single Source of Truth)
 * 여기만 수정하면 전체 사이트에 반영됩니다
 */

import type { SiteConfig } from './types';

export const siteConfig: SiteConfig = {
  domain: 'https://stockmatrix.co.kr',
  serviceName: 'Stock Matrix',
  serviceNameKo: '스탁매트릭스',
  deliveryTime: '오전 7시 50분',
  deliveryTimeShort: '7:50',
  stockCount: 3,
  indicatorCount: 30,
  markets: 'KOSPI·KOSDAQ',
} as const;