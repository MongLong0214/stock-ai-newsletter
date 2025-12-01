/**
 * 블로그 시스템 타입 정의
 * Enterprise-grade type definitions for SEO content automation
 */

// ============================================================================
// Database Types
// ============================================================================

/** 블로그 포스트 상태 */
export type BlogPostStatus = 'draft' | 'published' | 'archived';

/** FAQ 아이템 */
export interface FAQItem {
  question: string;
  answer: string;
}

/** Schema.org 구조화 데이터 */
export interface SchemaData {
  '@context': 'https://schema.org';
  '@type': 'Article' | 'BlogPosting';
  headline: string;
  description: string;
  author: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    logo: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  datePublished: string;
  dateModified: string;
  mainEntityOfPage: {
    '@type': 'WebPage';
    '@id': string;
  };
  image?: string;
  keywords?: string;
}

/** 블로그 포스트 (DB 스키마) */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  target_keyword: string;
  secondary_keywords: string[] | null;
  category: string;
  tags: string[] | null;
  competitor_urls: string[] | null;
  competitor_count: number;
  generation_prompt: string | null;
  status: BlogPostStatus;
  published_at: string | null;
  view_count: number;
  schema_data: SchemaData | null;
  faq_items: FAQItem[] | null;
  related_posts: string[] | null;
  created_at: string;
  updated_at: string;
}

/** 블로그 포스트 생성 입력 */
export interface BlogPostCreateInput {
  slug: string;
  title: string;
  description: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  target_keyword: string;
  secondary_keywords?: string[];
  category?: string;
  tags?: string[];
  competitor_urls?: string[];
  competitor_count?: number;
  generation_prompt?: string;
  status?: BlogPostStatus;
  schema_data?: SchemaData;
  faq_items?: FAQItem[];
}

/** 블로그 포스트 목록 아이템 (경량) */
export interface BlogPostListItem {
  slug: string;
  title: string;
  description: string;
  target_keyword: string;
  category: string;
  tags: string[] | null;
  published_at: string | null;
  view_count: number;
}

// ============================================================================
// SerpApi Types
// ============================================================================

/** SerpApi 검색 결과 아이템 */
export interface SerpSearchResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayed_link: string;
}

/** SerpApi 응답 */
export interface SerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    total_time_taken: number;
  };
  search_parameters: {
    q: string;
    google_domain: string;
    hl: string;
  };
  organic_results: SerpSearchResult[];
}

// ============================================================================
// Web Scraping Types
// ============================================================================

/** 스크래핑된 페이지 콘텐츠 */
export interface ScrapedContent {
  url: string;
  title: string;
  description: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  paragraphs: string[];
  wordCount: number;
  scrapedAt: string;
}

/** 경쟁사 분석 결과 */
export interface CompetitorAnalysis {
  totalCompetitors: number;
  commonTopics: string[];
  averageWordCount: number;
  keywordDensity: Record<string, number>;
  contentGaps: string[];
  scrapedContents: ScrapedContent[];
}

// ============================================================================
// Content Generation Types
// ============================================================================

/** 콘텐츠 생성 요청 */
export interface ContentGenerationRequest {
  targetKeyword: string;
  secondaryKeywords?: string[];
  competitorAnalysis: CompetitorAnalysis;
  contentType: 'comparison' | 'guide' | 'listicle' | 'review';
  targetWordCount: number;
}

/** 생성된 콘텐츠 */
export interface GeneratedContent {
  title: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
  content: string;
  headings: string[];
  faqItems: FAQItem[];
  suggestedTags: string[];
  estimatedReadTime: number;
}

// ============================================================================
// Pipeline Types
// ============================================================================

/** 파이프라인 설정 */
export interface PipelineConfig {
  maxCompetitors: number;
  minWordCount: number;
  maxWordCount: number;
  requestTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/** 파이프라인 실행 결과 */
export interface PipelineResult {
  success: boolean;
  blogPost?: BlogPostCreateInput;
  error?: string;
  metrics: {
    totalTime: number;
    serpApiCalls: number;
    pagesScraped: number;
    tokensUsed: number;
  };
}

/** 파이프라인 단계 */
export type PipelineStage =
  | 'search'
  | 'scrape'
  | 'analyze'
  | 'generate'
  | 'validate'
  | 'save';

/** 파이프라인 진행 상태 */
export interface PipelineProgress {
  stage: PipelineStage;
  progress: number;
  message: string;
}