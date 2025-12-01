import { siteConfig } from '@/lib/constants/seo/config';
import type { BlogPostListItem } from '../_types/blog';

function createCollectionPageSchema(posts: BlogPostListItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteConfig.domain}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };
}

export default createCollectionPageSchema;