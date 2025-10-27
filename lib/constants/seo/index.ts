/**
 * SEO 상수 중앙 Export
 * 모든 SEO 관련 설정을 한 곳에서 가져올 수 있습니다
 *
 * @example
 * ```typescript
 * import { siteConfig, metadataConfig, allKeywords } from '@/lib/constants/seo';
 *
 * console.log(siteConfig.domain);        // "https://stockmatrix.co.kr"
 * console.log(metadataConfig.title);     // "매일 7:50 AI 주식분석 무료 | StockMatrix"
 * console.log(allKeywords.length);       // 70
 * ```
 */

// ============================================================================
// 타입 정의
// ============================================================================
export type {
  SiteConfig,
  MetadataConfig,
  SocialMediaConfig,
  SchemaConfig,
  KeywordCategory,
} from './types';

// ============================================================================
// 설정 객체
// ============================================================================

/** 사이트 기본 설정 (도메인, 서비스명, 배송 시간 등) */
export { siteConfig } from './config';

/** 페이지 메타데이터 (title, description 등) */
export { metadataConfig } from './metadata';

/** 소셜 미디어 링크 (Twitter, Instagram, Threads) */
export { socialConfig } from './social';

/** JSON-LD 스키마 설명 */
export { schemaConfig } from './schema';

/** SEO 키워드 (카테고리별 70개) */
export { keywordsByCategory, allKeywords } from './keywords';