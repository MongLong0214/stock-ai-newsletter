/**
 * SEO 관련 TypeScript 타입 정의
 * 타입 안정성과 자동완성을 제공합니다
 */

export interface SiteConfig {
  readonly domain: string;
  readonly serviceName: string;
  readonly serviceNameKo: string;
  readonly deliveryTime: string;
  readonly deliveryTimeShort: string;
  readonly stockCount: number;
  readonly indicatorCount: number;
  readonly markets: string;
}

export interface MetadataConfig {
  readonly title: string;
  readonly titleTemplate: string;
  readonly description: string;
  readonly descriptionShort: string;
}

export interface SocialMediaConfig {
  readonly twitter: string;
  readonly instagram: string;
  readonly threads: string;
  readonly handle: string;
}

export interface SchemaConfig {
  readonly websiteDesc: string;
  readonly serviceName: string;
  readonly serviceDesc: string;
}

export interface KeywordCategory {
  readonly brand: readonly string[];
  readonly ai: readonly string[];
  readonly service: readonly string[];
  readonly market: readonly string[];
  readonly indicator: readonly string[];
  readonly analysis: readonly string[];
  readonly free: readonly string[];
  readonly time: readonly string[];
  readonly longTail: readonly string[];
}