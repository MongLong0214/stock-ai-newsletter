/**
 * Schema.org 구조화 데이터 생성기 (Single Source of Truth)
 *
 * [Schema.org란?]
 * - 검색엔진이 웹페이지 내용을 이해할 수 있도록 하는 표준 형식
 * - Google, Bing 등 주요 검색엔진에서 지원
 * - JSON-LD 형식으로 페이지에 삽입
 *
 * [왜 Schema.org가 필요한가?]
 * - 검색 결과에 리치 스니펫(별점, 가격 등) 표시 가능
 * - SEO(검색엔진 최적화)에 도움
 * - 검색엔진이 콘텐츠를 더 정확하게 인식
 *
 * [이 파일에서 생성하는 Schema]
 * 1. ArticleSchema: 블로그 글 정보 (페이지 렌더링용)
 * 2. BlogPostingSchema: 블로그 글 정보 (DB 저장용)
 * 3. FAQSchema: 자주 묻는 질문 (FAQ)
 * 4. BreadcrumbSchema: 페이지 경로 (홈 > 블로그 > 글제목)
 *
 * [중요]
 * - 모든 Schema 생성은 이 파일에서 통합 관리
 * - siteConfig를 Single Source of Truth로 사용
 * - 다른 파일에서 Schema 생성 로직 중복 금지
 */

import { siteConfig } from '@/lib/constants/seo/config';
import type { BlogPost, BlogPostCreateInput, FAQItem, SchemaData } from '../_types/blog';

/**
 * Article Schema 타입 정의
 * - 블로그 글에 대한 구조화 데이터
 */
interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;        // 글 제목
  description: string;     // 글 설명
  author: { '@type': 'Organization'; name: string; url: string };       // 작성자
  publisher: { '@type': 'Organization'; name: string; logo: { '@type': 'ImageObject'; url: string } }; // 발행처
  datePublished: string | null;  // 발행일
  dateModified: string;    // 수정일
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string };  // 페이지 URL
  keywords: string;        // 키워드
}

/**
 * FAQ Schema 타입 정의
 * - 자주 묻는 질문에 대한 구조화 데이터
 * - Google 검색 결과에 FAQ 섹션으로 표시될 수 있음
 */
interface FAQSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;          // 질문
    acceptedAnswer: { '@type': 'Answer'; text: string };  // 답변
  }>;
}

/**
 * Breadcrumb Schema 타입 정의
 * - 페이지 경로를 나타내는 구조화 데이터
 * - 예: Stock Matrix > 블로그 > 글제목
 */
interface BreadcrumbSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;      // 순서 (1, 2, 3...)
    name: string;          // 표시 이름
    item: string;          // URL
  }>;
}

/**
 * Article Schema 생성
 *
 * [생성되는 데이터]
 * - 글 제목, 설명, 작성자, 발행처
 * - 발행일, 수정일, 키워드
 *
 * @param post - 블로그 포스트 데이터
 * @param slug - URL 슬러그 (예: 'best-stock-newsletters')
 * @returns Article Schema 객체
 */
function createArticleSchema(post: BlogPost, slug: string): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Organization', name: siteConfig.serviceName, url: siteConfig.domain },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/logo.png` },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteConfig.domain}/blog/${slug}` },
    // 키워드: 타겟 키워드 + 보조 키워드들을 쉼표로 연결
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };
}

/**
 * FAQ Schema 생성
 *
 * [생성되는 데이터]
 * - 질문과 답변 목록
 * - Google 검색 결과에 FAQ 드롭다운으로 표시 가능
 *
 * @param faqItems - FAQ 아이템 배열
 * @returns FAQ Schema 객체 또는 null (FAQ가 없는 경우)
 */
function createFAQSchema(faqItems: FAQItem[]): FAQSchema | null {
  // FAQ 항목이 없으면 null 반환
  if (!faqItems || faqItems.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    // 각 FAQ 항목을 Schema 형식으로 변환
    mainEntity: faqItems.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/**
 * BlogPosting Schema 생성 (DB 저장용)
 *
 * [Article vs BlogPosting 차이]
 * - Article: 일반 기사 (뉴스, 매거진 등)
 * - BlogPosting: 블로그 글 (개인/회사 블로그)
 * - Google은 둘 다 동일하게 인식하지만, BlogPosting이 블로그에 더 적합
 *
 * [사용 위치]
 * - blog-repository.ts의 saveBlogPost() 함수
 * - DB에 저장되어 페이지 렌더링 시 사용
 *
 * @param post - 저장할 블로그 포스트 데이터
 * @param slug - URL 슬러그
 * @returns SchemaData 객체 (DB 저장용)
 */
function createBlogPostingSchema(post: BlogPostCreateInput, slug: string): SchemaData {
  const now = new Date().toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.domain}/logo.png`,
      },
    },
    datePublished: now,
    dateModified: now,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.domain}/blog/${slug}`,
    },
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };
}

/**
 * Breadcrumb Schema 생성
 *
 * [생성되는 경로]
 * 1. Stock Matrix (홈)
 * 2. 블로그 (목록 페이지)
 * 3. 글 제목 (현재 페이지)
 *
 * [SEO 효과]
 * - 검색 결과에 경로 표시: stockmatrix.co.kr > 블로그 > 글제목
 * - 사이트 구조 파악에 도움
 *
 * @param postTitle - 글 제목
 * @param slug - URL 슬러그
 * @returns Breadcrumb Schema 객체
 */
function createBreadcrumbSchema(postTitle: string, slug: string): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      // 1단계: 홈페이지
      { '@type': 'ListItem', position: 1, name: 'Stock Matrix', item: siteConfig.domain },
      // 2단계: 블로그 목록
      { '@type': 'ListItem', position: 2, name: '블로그', item: `${siteConfig.domain}/blog` },
      // 3단계: 현재 글
      { '@type': 'ListItem', position: 3, name: postTitle, item: `${siteConfig.domain}/blog/${slug}` },
    ],
  };
}

// 함수들을 named export로 내보내기
export { createArticleSchema, createBlogPostingSchema, createFAQSchema, createBreadcrumbSchema };

// 타입들도 내보내기 (다른 파일에서 타입 참조 시 사용)
export type { ArticleSchema, FAQSchema, BreadcrumbSchema };