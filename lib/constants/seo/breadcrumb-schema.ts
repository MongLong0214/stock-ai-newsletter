/**
 * Breadcrumb Schema Generator for Stock Matrix
 * Helps search engines understand site hierarchy
 */

import { siteConfig } from './config';

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function generateBreadcrumbSchema(items: readonly BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Common breadcrumb patterns
export const breadcrumbPatterns = {
  about: [
    { name: '홈', url: siteConfig.domain },
    { name: '서비스 소개', url: `${siteConfig.domain}/about` },
  ],
  faq: [
    { name: '홈', url: siteConfig.domain },
    { name: '자주 묻는 질문', url: `${siteConfig.domain}/faq` },
  ],
  technicalIndicators: [
    { name: '홈', url: siteConfig.domain },
    { name: '기술적 지표', url: `${siteConfig.domain}/technical-indicators` },
  ],
  subscribe: [
    { name: '홈', url: siteConfig.domain },
    { name: '무료 구독', url: `${siteConfig.domain}/subscribe` },
  ],
} as const;