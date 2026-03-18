/** 블로그 포스트 DB 스키마 및 입출력 타입 */

export type BlogPostStatus = 'draft' | 'published' | 'archived';

export type ContentType = 'comparison' | 'guide' | 'listicle' | 'review';

export interface FAQItem {
  question: string;
  answer: string;
}

export interface SchemaData {
  /** Schema.org 컨텍스트 URL */
  '@context': 'https://schema.org';
  /** Article 또는 BlogPosting */
  '@type': 'Article' | 'BlogPosting';
  '@id'?: string;
  headline: string;
  description: string;
  author: {
    '@type': 'Organization';
    '@id'?: string;
    name: string;
    url: string;
  };
  publisher: {
    '@type': 'Organization';
    '@id'?: string;
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
  isPartOf?: { '@id': string };
  inLanguage?: string;
  image?: string;
  keywords?: string;
}

/** Supabase blog_posts 테이블 전체 스키마 */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  /** 중복 콘텐츠 방지용 정규 URL */
  canonical_url: string | null;
  target_keyword: string;
  secondary_keywords: string[] | null;
  category: string;
  tags: string[] | null;
  competitor_urls: string[] | null;
  competitor_count: number;
  /** AI 콘텐츠 생성에 사용된 프롬프트 */
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

/** 블로그 포스트 생성 입력 (자동 생성 필드 제외) */
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
  published_at?: string;
  schema_data?: SchemaData;
  faq_items?: FAQItem[];
}

/** 블로그 목록용 경량 타입 (content 제외) */
export interface BlogPostListItem {
  slug: string;
  title: string;
  description: string;
  target_keyword: string;
  /** DB 쿼리에서 생략 가능 */
  category?: string;
  tags: string[] | null;
  published_at: string | null;
  view_count: number;
}
