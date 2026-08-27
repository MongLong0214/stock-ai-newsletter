import { siteConfig } from '@/lib/constants/seo/config';
import { INITIAL_RENDER_COUNT } from '../_config/list-config';
import type { BlogPostListItem } from '../_types/blog';

function createCollectionPageSchema(posts: BlogPostListItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '주식 투자 블로그',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    // 실제로 렌더되는 개수만 선언한다. 전체(1000+)를 넣으면 225KB짜리 JSON-LD가 되고,
    // 방문자가 보는 DOM(24개)과 스키마 주장이 어긋난다. 전체 글 발견은 sitemap 담당.
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: Math.min(posts.length, INITIAL_RENDER_COUNT),
      itemListElement: posts.slice(0, INITIAL_RENDER_COUNT).map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteConfig.domain}/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };
}

export default createCollectionPageSchema;