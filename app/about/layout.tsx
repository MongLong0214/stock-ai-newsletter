import type { Metadata } from 'next';
import { siteConfig, keywordsByCategory } from '@/lib/constants/seo';

export const metadata: Metadata = {
  title: 'Stock Matrix 소개 - 30개 지표로 분석하는 AI 주식 뉴스레터',
  description:
    'RSI, MACD, 볼린저밴드 등 30개 기술적 지표를 AI가 실시간 분석하여 매일 아침 7시 50분 KOSPI, KOSDAQ 3종목 정보를 무료 이메일로 발송. 투자 참고용 기술적 분석 데이터 제공.',
  keywords: [
    ...keywordsByCategory.brand,
    ...keywordsByCategory.ai,
    ...keywordsByCategory.service,
    'AI 주식 분석 소개',
    '무료 뉴스레터 서비스',
    '기술적 분석 자동화',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/about`,
  },
  openGraph: {
    title: 'Stock Matrix - AI가 30개 지표로 분석하는 무료 주식 뉴스레터',
    description:
      '매일 아침 7시 50분, AI가 RSI·MACD·볼린저밴드 등 30개 지표로 KOSPI/KOSDAQ 3종목 분석',
    url: `${siteConfig.domain}/about`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'website',
    images: [
      {
        url: `${siteConfig.domain}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Stock Matrix AI 주식 분석 서비스',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Matrix - AI 주식 분석 뉴스레터',
    description: '30개 기술지표 AI 분석, 매일 7:50 무료 발송',
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white pt-20">
      {children}
    </div>
  );
}