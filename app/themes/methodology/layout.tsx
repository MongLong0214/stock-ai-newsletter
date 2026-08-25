import type { Metadata } from 'next'
import { siteConfig, withOgImageVersion } from '@/lib/constants/seo/config'
import { generateBreadcrumbSchema } from '@/lib/constants/seo/breadcrumb-schema'

export const metadata: Metadata = {
  title: '테마 추적 알고리즘 — 점수 산출 과정 공개',
  description:
    '테마 점수와 방향 전망이 계산되는 과정을 공개합니다. 4가지 점수 요소, 생명주기 5단계 판정, 7일 방향 전망을 투명하게 설명합니다.',
  keywords: [
    '테마 추적 알고리즘',
    'TLI 점수',
    '테마 생명주기',
    'AI 분석 알고리즘',
    '테마주 점수 산출',
    '테마 분석 방법론',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/themes/methodology`,
  },
  openGraph: {
    title: '테마 추적 알고리즘 — 점수 산출 과정 공개 | StockMatrix',
    description:
      '테마 점수와 방향 전망 계산 과정을 공개합니다. 4가지 점수 요소, 생명주기 5단계 판정, 7일 방향 전망을 투명하게 설명합니다.',
    url: `${siteConfig.domain}/themes/methodology`,
    type: 'article',
    locale: 'ko_KR',
    images: [
      {
        url: withOgImageVersion('/themes/methodology/opengraph-image'),
        width: 1200,
        height: 630,
        alt: '테마 추적 알고리즘 공개',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '테마 추적 알고리즘 — 점수 산출 과정 공개 | StockMatrix',
    description:
      '테마 점수와 방향 전망 계산 과정을 공개합니다. 4가지 점수 요소, 생명주기 5단계 판정, 7일 방향 전망을 투명하게 설명합니다.',
    images: [withOgImageVersion('/themes/methodology/opengraph-image')],
  },
}

const MethodologyLayout = ({ children }: { children: React.ReactNode }) => {
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: '홈', url: siteConfig.domain },
    { name: '테마 분석', url: `${siteConfig.domain}/themes` },
    { name: '테마 추적 알고리즘', url: `${siteConfig.domain}/themes/methodology` },
  ])

  return (
    <>
      <script
        id="methodology-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      {children}
    </>
  )
}

export default MethodologyLayout
