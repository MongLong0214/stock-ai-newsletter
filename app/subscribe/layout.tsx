import { Metadata } from 'next';
import { ReactNode } from 'react';
import { siteConfig, keywordsByCategory } from '@/lib/constants/seo';

export const metadata: Metadata = {
  title: '무료 구독하기 - 매일 7:50 AI 주식분석 이메일 | Stock Matrix',
  description:
    '지금 이메일 주소만 입력하면 내일부터 매일 아침 7시 50분에 AI가 분석한 KOSPI, KOSDAQ 3종목 기술적 분석 리포트를 무료로 받아보세요. RSI, MACD, 볼린저밴드 등 30개 지표 분석.',
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
    description: '매일 7:50 AI 주식분석 무료 이메일 구독. KOSPI·KOSDAQ 3종목 분석',
    url: `${siteConfig.domain}/subscribe`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: `${siteConfig.domain}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 무료 구독',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '무료 구독 - Stock Matrix',
    description: '매일 7:50 AI 주식분석 무료 이메일',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SubscribeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}