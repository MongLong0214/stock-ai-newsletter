import type { Metadata } from 'next';
import { siteConfig, keywordsByCategory } from '@/lib/constants/seo';

export const metadata: Metadata = {
  title: '뉴스레터 아카이브 - Stock Matrix AI 주식 분석 기록',
  description:
    '과거 발송된 Stock Matrix AI 주식 뉴스레터를 날짜별로 확인하세요. RSI, MACD, 볼린저밴드 등 30개 기술적 지표 분석 결과와 추천 종목 히스토리를 제공합니다.',
  keywords: [
    ...keywordsByCategory.brand,
    ...keywordsByCategory.service,
    '뉴스레터 아카이브',
    '주식 분석 기록',
    'AI 추천 종목 히스토리',
    '과거 뉴스레터',
    '기술적 분석 아카이브',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/archive`,
  },
  openGraph: {
    title: 'Stock Matrix 뉴스레터 아카이브 - AI 주식 분석 기록',
    description:
      '과거 발송된 AI 주식 분석 뉴스레터를 날짜별로 확인하고 추천 종목 히스토리를 살펴보세요',
    url: `${siteConfig.domain}/archive`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: `${siteConfig.domain}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 뉴스레터 아카이브',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Matrix 뉴스레터 아카이브',
    description: 'AI 주식 분석 뉴스레터 히스토리 확인',
  },
};

export default function ArchiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}