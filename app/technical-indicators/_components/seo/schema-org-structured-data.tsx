/**
 * Schema.org 구조화 데이터 컴포넌트
 *
 * SEO 최적화를 위한 JSON-LD 구조화 데이터를 삽입합니다.
 *
 * 제공하는 기능:
 * - Google Rich Snippets 지원
 * - 검색 엔진의 콘텐츠 이해도 향상
 * - Article 스키마 적용
 *
 * @see https://schema.org/Article
 * @see https://developers.google.com/search/docs/appearance/structured-data/article
 */

import { technicalIndicatorsContent } from '@/lib/constants/seo/technical-indicators-content';

function SchemaOrgStructuredData() {
  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: technicalIndicatorsContent.seo.title,
    description: technicalIndicatorsContent.seo.description,
    author: {
      '@type': 'Organization',
      name: 'Stock Matrix',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Stock Matrix',
      url: 'https://stockmatrix.co.kr',
    },
    keywords: technicalIndicatorsContent.seo.keywords.join(', '),
    articleSection: 'Investment Education',
    inLanguage: 'ko-KR',
    educationalLevel: 'Beginner to Intermediate',
    learningResourceType: 'Educational Article',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schemaData),
      }}
    />
  );
}

export default SchemaOrgStructuredData;