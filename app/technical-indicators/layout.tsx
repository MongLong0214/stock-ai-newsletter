import type { Metadata } from 'next';
import { siteConfig, keywordsByCategory } from '@/lib/constants/seo';

export const metadata: Metadata = {
  title: '기술적 지표 완벽 가이드 - RSI·MACD·볼린저밴드 | Stock Matrix',
  description:
    'RSI(상대강도지수), MACD 골든크로스, 볼린저밴드, 이동평균선, 스토캐스틱 등 30가지 기술적 분석 지표의 의미와 활용법. AI 주식 분석에 사용되는 핵심 지표 완벽 정리.',
  keywords: [
    ...keywordsByCategory.indicator,
    ...keywordsByCategory.analysis,
    'RSI 지표란',
    'MACD 골든크로스',
    '볼린저밴드 활용법',
    '이동평균선 정배열',
    '스토캐스틱 과매도',
    'CCI 지표',
    'ADX 추세 강도',
    '기술적 지표 교육',
    '주식 차트 분석',
  ],
  alternates: {
    canonical: `${siteConfig.domain}/technical-indicators`,
  },
  openGraph: {
    title: '30가지 기술적 지표 완벽 가이드 - Stock Matrix',
    description:
      'RSI, MACD, 볼린저밴드 등 AI가 활용하는 30개 기술지표의 의미와 매매 시그널 해석법',
    url: `${siteConfig.domain}/technical-indicators`,
    siteName: siteConfig.serviceName,
    locale: 'ko_KR',
    type: 'article',
    images: [
      {
        url: `${siteConfig.domain}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: '기술적 지표 가이드 - Stock Matrix',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RSI·MACD·볼린저밴드 등 30개 기술지표 완벽 가이드',
    description: 'AI 주식 분석에 사용되는 핵심 기술적 지표 총정리',
  },
};

export default function TechnicalIndicatorsLayout({
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