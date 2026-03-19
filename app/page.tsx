import type { Metadata } from 'next';
import { siteConfig, withOgImageVersion } from '@/lib/constants/seo';
import { schemaIds } from '@/lib/constants/seo/config';
import { TECHNICAL_INDICATORS_DATA } from "./constants/home-page";
import HomePageClient from "./_components/home/home-page-client";
import LatestBlogSection from "./_components/home/latest-blog-section";

export const metadata: Metadata = {
  title: 'StockMatrix | 무료 AI 주식 분석 뉴스레터 · KOSPI·KOSDAQ 3종목 분석',
  description:
    '한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터. 매일 오전 7시 30분, AI가 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 제공합니다. 웹사이트에서는 250+ 테마 생명주기와 관련 종목 분석도 확인할 수 있습니다.',
  keywords: [
    'StockMatrix',
    'AI 주식 분석',
    '무료 주식 뉴스레터',
    'KOSPI 뉴스레터',
    'KOSDAQ 뉴스레터',
    '기술적 지표 분석',
    '테마주 분석',
    '주식 투자 뉴스레터',
  ],
  alternates: {
    canonical: siteConfig.domain,
  },
  openGraph: {
    title: 'StockMatrix | 무료 AI 주식 분석 뉴스레터 · KOSPI·KOSDAQ 3종목 분석',
    description:
      '매일 오전 7시 30분, AI가 KOSPI·KOSDAQ 3종목을 분석해 무료 이메일로 제공하는 한국 주식 뉴스레터. 웹사이트에서 250+ 테마 분석 제공',
    url: siteConfig.domain,
    type: 'website',
    locale: 'ko_KR',
    siteName: 'StockMatrix',
    images: [
      {
        url: withOgImageVersion('/opengraph-image'),
        width: 1200,
        height: 630,
        alt: 'StockMatrix 무료 AI 주식 분석 뉴스레터',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StockMatrix | 무료 AI 주식 분석 뉴스레터',
    description:
      '매일 오전 7시 30분, KOSPI·KOSDAQ 3종목을 AI로 분석해 무료 이메일로 제공하는 한국 주식 뉴스레터. 웹사이트에서 250+ 테마 분석 제공',
    images: [withOgImageVersion('/twitter-image')],
  },
};

export default function HomePage() {
  const homePageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': schemaIds.pageId('/'),
    name: 'StockMatrix 무료 AI 주식 분석 뉴스레터',
    description:
      '한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터. 매일 오전 7시 30분, AI가 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 제공하며, 웹사이트에서는 250+ 테마 생명주기 분석을 확인할 수 있습니다.',
    url: siteConfig.domain,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': schemaIds.website },
    about: [
      'AI 주식 분석',
      '무료 주식 뉴스레터',
      'KOSPI 분석',
      'KOSDAQ 분석',
      '기술적 지표',
      '테마주 생명주기',
    ],
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: withOgImageVersion(`${siteConfig.domain}/opengraph-image`),
      width: 1200,
      height: 630,
    },
    mainEntity: { '@id': schemaIds.service },
  };

  return (
    <>
      <HomePageClient technicalIndicators={TECHNICAL_INDICATORS_DATA} />
      <LatestBlogSection />

      <script
        id="homepage-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(homePageSchema).replace(/</g, '\\u003c'),
        }}
      />
    </>
  );
}
