import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://stockmatrix.co.kr'),
  title: {
    default: 'STOCK MATRIX - AI 주식 분석 무료 뉴스레터',
    template: '%s | StockMatrix',
  },
  description: 'AI가 분석한 KOSPI·KOSDAQ 종목 5개를 매일 오전 7시 50분 무료로 받아보세요.',
  keywords: [
    'AI 주식 분석',
    'GPT 주식',
    'Claude AI 주식',
    'Gemini AI',
    '무료 주식 뉴스레터',
    'KOSPI 분석',
    'KOSDAQ 추천',
    'RSI 지표',
    'MACD 분석',
    '볼린저밴드',
    '기술적 분석',
    '주식 기술지표',
    '무료 주식 정보',
    '주식 이메일',
    'StockMatrix',
    '스탁매트릭스',
    '주식 투자',
    '주식 공부',
    '30개 기술지표',
    '오전 7시 50분',
  ],
  authors: [{ name: 'Stock Matrix', url: 'https://stockmatrix.co.kr' }],
  creator: 'Stock Matrix',
  publisher: 'Stock Matrix',
  alternates: {
    canonical: 'https://stockmatrix.co.kr',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://stockmatrix.co.kr',
    title: 'STOCK MATRIX - AI 기술적 분석 뉴스레터',
    description: 'KOSPI·KOSDAQ 5개 종목, AI 기술적 분석 뉴스레터 무료 발송',
    siteName: 'Stock Matrix',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Stock Matrix - AI 주식 분석',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'STOCK MATRIX - AI 기술적 분석 뉴스레터',
    description: 'KOSPI·KOSDAQ 5개 종목, AI 기술적 분석 뉴스레터 무료 발송',
    creator: '@aistockmatrix',
    site: '@aistockmatrix',
    images: ['/twitter-image'],
  },
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: '3SavpxZkoJOuLHdnV94F9xjHNL7rPyyTJjQGbfttv5g',
    other: {
      'naver-site-verification': '5ce857b8cfd4c2e2b15181ee3029b6fce6590c18',
    },
  },
  category: 'finance',
  classification: 'Business',
  referrer: 'origin-when-cross-origin',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://stockmatrix.co.kr/#organization',
        name: 'Stock Matrix',
        url: 'https://stockmatrix.co.kr',
        logo: {
          '@type': 'ImageObject',
          url: 'https://stockmatrix.co.kr/icon',
          width: 512,
          height: 512,
          caption: 'Stock Matrix Logo',
        },
        image: {
          '@type': 'ImageObject',
          url: 'https://stockmatrix.co.kr/icon',
          width: 512,
          height: 512,
        },
        sameAs: [
          'https://x.com/aistockmatrix',
          'https://www.instagram.com/aistockmatrix/',
          'https://www.threads.net/@aistockmatrix',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          availableLanguage: ['Korean'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://stockmatrix.co.kr/#website',
        url: 'https://stockmatrix.co.kr',
        name: 'Stock Matrix',
        description: 'AI가 RSI, MACD, 볼린저밴드 등 기술적 지표로 분석한 KOSPI·KOSDAQ 5개 종목의 참고용 데이터를 매일 오전 7시 50분 무료로 받아보세요. 투자 권유가 아닌 기술적 분석 뉴스레터',
        publisher: {
          '@id': 'https://stockmatrix.co.kr/#organization',
        },
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'Service',
        '@id': 'https://stockmatrix.co.kr/#service',
        name: 'Stock Matrix - AI 주식 기술적 분석 뉴스레터',
        description: 'AI가 RSI(상대강도지수), MACD(이동평균수렴확산), 볼린저밴드, 이동평균선 등 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 5개 종목의 참고용 데이터를 매일 오전 7시 50분 무료 이메일 발송. 투자 권유나 매매 추천이 아닌 기술적 분석 정보만 제공하는 뉴스레터.',
        provider: {
          '@id': 'https://stockmatrix.co.kr/#organization',
        },
        serviceType: '주식 기술적 분석 데이터 뉴스레터',
        areaServed: {
          '@type': 'Country',
          name: '대한민국',
        },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'KRW',
          availability: 'https://schema.org/InStock',
          description: '완전 무료 서비스 - 참고용 기술적 분석 데이터 제공',
        },
        audience: {
          '@type': 'Audience',
          audienceType: '주식 관심자',
        },
        category: 'Financial Data Services',
      },
    ],
  };

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}