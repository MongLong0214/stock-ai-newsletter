import type { Metadata } from 'next';
import { siteConfig, metadataConfig } from '@/lib/constants/seo';
import { schemaIds } from '@/lib/constants/seo/config';
import { TECHNICAL_INDICATORS_DATA } from "./constants/home-page";
import HomePageClient from "./_components/home/home-page-client";
import LatestBlogSection from "./_components/home/latest-blog-section";

export const metadata: Metadata = {
  title: metadataConfig.title,
  description: metadataConfig.description,
  openGraph: {
    title: metadataConfig.title,
    description: metadataConfig.description,
    url: siteConfig.domain,
    type: 'website',
  },
};

export default function HomePage() {
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': schemaIds.pageId('/'),
    name: 'Stock Matrix — AI 주식 분석 뉴스레터',
    description:
      '매일 오전 7시 30분 AI가 30가지 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 제공하는 무료 주식 분석 뉴스레터',
    brand: { '@id': schemaIds.organization },
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KRW',
      availability: 'https://schema.org/InStock',
    },
    category: 'Finance',
    image: `${siteConfig.domain}/opengraph-image`,
  };

  return (
    <>
      <HomePageClient technicalIndicators={TECHNICAL_INDICATORS_DATA} />
      <LatestBlogSection />

      <script
        id="product-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productSchema).replace(/</g, '\\u003c'),
        }}
      />
    </>
  );
}
