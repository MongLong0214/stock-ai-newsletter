/**
 * Schema.org structured data generators (Single Source of Truth)
 *
 * Generates: Article, BlogPosting, FAQ, Breadcrumb schemas
 * Google Search Central best practice 준수:
 * - @id 기반 엔티티 그래프 연결
 * - image 3가지 비율 (16:9, 4:3, 1:1)
 * - datePublished/dateModified KST timezone
 * - inLanguage, isPartOf, speakable xPath
 */

import { siteConfig, schemaIds, ensureKSTTimezone, withOgImageVersion } from '@/lib/constants/seo/config';
import type { BlogPost, BlogPostCreateInput, FAQItem, SchemaData } from '../_types/blog';

function createArticleSchema(post: BlogPost, slug: string) {
  const wordCount = post.content ? post.content.replace(/<[^>]*>/g, '').split(/\s+/).length : undefined;
  const url = `${siteConfig.domain}/blog/${slug}`;
  const ogImage = withOgImageVersion(`${url}/opengraph-image`);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': schemaIds.articleId(`/blog/${slug}`),
    headline: post.title,
    description: post.description,
    image: [
      { '@type': 'ImageObject', url: ogImage, width: 1200, height: 675 },
      { '@type': 'ImageObject', url: ogImage, width: 1200, height: 900 },
      { '@type': 'ImageObject', url: ogImage, width: 1200, height: 1200 },
    ],
    author: {
      '@type': 'Organization',
      '@id': schemaIds.organization,
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    publisher: {
      '@type': 'Organization',
      '@id': schemaIds.organization,
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/icon-512.png` },
    },
    datePublished: ensureKSTTimezone(post.published_at) || new Date().toISOString(),
    dateModified: ensureKSTTimezone(post.updated_at) || ensureKSTTimezone(post.published_at) || new Date().toISOString(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': schemaIds.pageId(`/blog/${slug}`) },
    isPartOf: { '@id': schemaIds.website },
    inLanguage: 'ko-KR',
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
    wordCount,
    articleSection: post.category || '투자 분석',
    about: post.target_keyword
      ? [{ '@type': 'Thing', name: post.target_keyword }]
      : undefined,
    speakable: {
      '@type': 'SpeakableSpecification',
      xPath: [
        '/html/head/title',
        '/html/head/meta[@name=\'description\']/@content',
      ],
    },
  };
}

function createFAQSchema(faqItems: FAQItem[]) {
  if (!faqItems || faqItems.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

function createBlogPostingSchema(post: BlogPostCreateInput, slug: string): SchemaData {
  const now = new Date().toISOString();

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': schemaIds.articleId(`/blog/${slug}`),
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Organization',
      '@id': schemaIds.organization,
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    publisher: {
      '@type': 'Organization',
      '@id': schemaIds.organization,
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/icon-512.png` },
    },
    datePublished: now,
    dateModified: now,
    mainEntityOfPage: { '@type': 'WebPage', '@id': schemaIds.pageId(`/blog/${slug}`) },
    isPartOf: { '@id': schemaIds.website },
    inLanguage: 'ko-KR',
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };
}

function createBreadcrumbSchema(postTitle: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stock Matrix', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '블로그', item: `${siteConfig.domain}/blog` },
      { '@type': 'ListItem', position: 3, name: postTitle },
    ],
  };
}

export { createArticleSchema, createBlogPostingSchema, createFAQSchema, createBreadcrumbSchema };
