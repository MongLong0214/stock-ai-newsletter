import type { Metadata } from 'next';
import { siteConfig, keywordsByCategory, withOgImageVersion } from '@/lib/constants/seo';

export const metadata: Metadata = {
  title: '뉴스레터 분석 기록 - Stock Matrix AI 주식 분석',
  description:
    '과거 발송된 Stock Matrix AI 주식 뉴스레터를 날짜별로 확인하세요. RSI, MACD, 볼린저밴드 등 30개 기술적 지표 분석 결과와 추천 종목 히스토리를 제공합니다.',
  keywords: [
    ...keywordsByCategory.brand,
    ...keywordsByCategory.service,
    '뉴스레터 분석 기록',
    '주식 분석 기록',
    'AI 추천 종목 히스토리',
    '과거 뉴스레터',
    '기술적 분석 기록',
    'KOSPI 종목 분석',
    'KOSDAQ 종목 분석',
    '기술적 지표 히스토리',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/archive`,
  },
  openGraph: {
    title: 'Stock Matrix 뉴스레터 분석 기록 - AI 주식 분석',
    description:
      '과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 확인하고 추천 종목 히스토리를 살펴보세요',
    url: `${siteConfig.domain}/archive`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: withOgImageVersion('/archive/opengraph-image'),
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 뉴스레터 분석 기록',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Matrix 뉴스레터 분석 기록',
    description: 'AI 주식 분석 뉴스레터 히스토리 확인',
    images: [withOgImageVersion('/archive/opengraph-image')],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function ArchiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: '홈',
        item: siteConfig.domain,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: '분석 기록',
        item: `${siteConfig.domain}/archive`,
      },
    ],
  };

  const collectionPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '뉴스레터 분석 기록',
    description:
      '과거 발송된 Stock Matrix AI 주식 뉴스레터를 날짜별로 확인하세요. RSI, MACD, 볼린저밴드 등 30개 기술적 지표 분석 결과와 추천 종목 히스토리를 제공합니다.',
    url: `${siteConfig.domain}/archive`,
    inLanguage: 'ko-KR',
    isPartOf: {
      '@type': 'WebSite',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    about: {
      '@type': 'Thing',
      name: 'AI 주식 분석',
      description: '인공지능 기반 기술적 분석 뉴스레터',
    },
    keywords:
      'AI 주식 분석, 뉴스레터 분석 기록, 기술적 지표, KOSPI, KOSDAQ, RSI, MACD, 볼린저밴드',
  };

  return (
    <>
      <script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />
      <script
        id="collection-page-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageSchema).replace(/</g, '\\u003c') }}
      />
      {children}
    </>
  );
}
