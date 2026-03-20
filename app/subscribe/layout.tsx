import { Metadata } from 'next';
import { ReactNode } from 'react';
import { siteConfig, keywordsByCategory, generateBreadcrumbSchema, schemaConfig, withOgImageVersion } from '@/lib/constants/seo';
import { schemaIds } from '@/lib/constants/seo/config';

export const metadata: Metadata = {
  title: '무료 구독하기 — 매일 7:30 AI 주식분석 이메일 | Stock Matrix',
  description:
    '이메일만 입력하면 5초 구독. 매일 7:30 AI가 30개 지표로 분석한 KOSPI·KOSDAQ 3종목을 무료 이메일로 받아보세요.',
  keywords: [
    ...keywordsByCategory.service,
    ...keywordsByCategory.free,
    '무료 구독',
    '이메일 뉴스레터 구독',
    '주식 분석 구독',
    '무료 주식 리포트',
    '매일 주식 정보',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/subscribe`,
  },
  openGraph: {
    title: '무료 구독 - Stock Matrix AI 주식 분석',
    description: '매일 7:30 AI 주식분석 무료 이메일 구독. KOSPI·KOSDAQ 3종목 분석',
    url: `${siteConfig.domain}/subscribe`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: withOgImageVersion('/subscribe/opengraph-image'),
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 무료 구독',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '무료 구독 - Stock Matrix',
    description: '매일 7:30 AI 주식분석 무료 이메일',
    images: [withOgImageVersion('/subscribe/opengraph-image')],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SubscribeLayout({ children }: { children: ReactNode }) {
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: '홈', url: siteConfig.domain },
    { name: '무료 구독', url: `${siteConfig.domain}/subscribe` },
  ]);

  const subscribePageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': schemaIds.pageId('/subscribe'),
    name: '무료 구독 — StockMatrix AI 주식 분석 뉴스레터',
    description: schemaConfig.serviceDesc,
    url: `${siteConfig.domain}/subscribe`,
    isPartOf: { '@id': schemaIds.website },
    about: { '@id': schemaIds.service },
    potentialAction: {
      '@type': 'SubscribeAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.domain}/subscribe`,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
      object: {
        '@type': 'Service',
        name: 'StockMatrix 무료 뉴스레터',
        description:
          '매일 오전 7:30 AI가 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목 정보를 무료 이메일로 발송',
      },
    },
  };

  return (
    <>
      <script
        id="subscribe-breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      <script
        id="subscribe-page-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(subscribePageSchema).replace(/</g, '\\u003c') }}
      />
      {children}
    </>
  );
}
