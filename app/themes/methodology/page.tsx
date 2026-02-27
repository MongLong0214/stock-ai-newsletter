import { siteConfig } from '@/lib/constants/seo/config'
import MethodologyContent from './_components/methodology-content'

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: '테마 분석',
      item: `${siteConfig.domain}/themes`,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: '트래킹 알고리즘',
      item: `${siteConfig.domain}/themes/methodology`,
    },
  ],
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: '테마 트래킹 알고리즘 — AI 점수 산출 과정 완전 공개',
  description:
    'TLI(Theme Lifecycle Index) 테마 트래킹 알고리즘을 완전 공개합니다.',
  author: {
    '@type': 'Organization',
    name: siteConfig.serviceName,
    url: siteConfig.domain,
  },
  publisher: {
    '@type': 'Organization',
    name: siteConfig.serviceName,
    url: siteConfig.domain,
  },
}

const MethodologyPage = () => {
  return (
    <>
      <script
        id="methodology-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c'),
        }}
      />
      <script
        id="methodology-article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c'),
        }}
      />
      <MethodologyContent />
    </>
  )
}

export default MethodologyPage
