/**
 * Schema.org structured data generators (Single Source of Truth)
 *
 * Generates: Article, BlogPosting, FAQ, Breadcrumb schemas
 */

import { siteConfig } from '@/lib/constants/seo/config';
import type { BlogPost, BlogPostCreateInput, FAQItem, SchemaData } from '../_types/blog';

interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  image: string[];
  author: { '@type': 'Organization'; name: string; url: string };
  publisher: { '@type': 'Organization'; name: string; logo: { '@type': 'ImageObject'; url: string } };
  datePublished: string | null;
  dateModified: string;
  mainEntityOfPage: { '@type': 'WebPage'; '@id': string };
  keywords: string;
}

interface FAQSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }>;
}

interface BreadcrumbSchema {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }>;
}

function createArticleSchema(post: BlogPost, slug: string): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: [`${siteConfig.domain}/blog/${slug}/opengraph-image`],
    author: { '@type': 'Organization', name: siteConfig.serviceName, url: siteConfig.domain },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: { '@type': 'ImageObject', url: `${siteConfig.domain}/logo.png` },
    },
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteConfig.domain}/blog/${slug}` },
    keywords: [post.target_keyword, ...(post.secondary_keywords || [])].join(', '),
  };
}

function createFAQSchema(faqItems: FAQItem[]): FAQSchema | null {
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

function createBreadcrumbSchema(postTitle: string, slug: string): BreadcrumbSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stock Matrix', item: siteConfig.domain },
      { '@type': 'ListItem', position: 2, name: '블로그', item: `${siteConfig.domain}/blog` },
      { '@type': 'ListItem', position: 3, name: postTitle, item: `${siteConfig.domain}/blog/${slug}` },
    ],
  };
}

export { createArticleSchema, createBlogPostingSchema, createFAQSchema, createBreadcrumbSchema };