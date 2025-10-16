import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'STOCK MATRIX - AI 주식 분석 뉴스레터 | 매일 오전 7시 50분 무료 발송',
    template: '%s | STOCK MATRIX',
  },
  description: 'AI가 기술적 지표 기반으로 분석한 KOSPI·KOSDAQ 5개 종목의 기술적 분석 데이터를 매일 무료로 받아보세요. 투자 권유가 아닌 참고용 정보 제공.',
  keywords: [
    'AI 주식 분석',
    '기술적 분석',
    '무료 주식 뉴스레터',
    'KOSPI 분석',
    'KOSDAQ 분석',
    'Stock Matrix',
    'Gemini AI',
    'Google Gemini',
    '주식 기술적 지표',
    '주식 데이터',
    '한국주식 분석',
    '데이터 기반 분석',
    '주식 뉴스레터',
    '무료 주식 데이터',
    '기술적 분석 지표',
    'RSI',
    'MACD',
    '볼린저밴드',
  ],
  authors: [{ name: 'Stock Matrix', url: 'https://stockmatrix.co.kr' }],
  creator: 'Stock Matrix',
  publisher: 'Stock Matrix',
  metadataBase: new URL('https://stockmatrix.co.kr'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://stockmatrix.co.kr',
    title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
    description: 'AI가 기술적 지표 기반으로 분석한 KOSPI·KOSDAQ 5개 종목의 기술적 분석 데이터를 매일 무료로 받아보세요.',
    siteName: 'Stock Matrix',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Stock Matrix - AI 주식 기술적 분석 뉴스레터',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
    description: 'AI가 분석한 KOSPI·KOSDAQ 5개 종목의 기술적 분석 데이터',
    images: ['/twitter-image'],
    creator: '@stockmatrix',
    site: '@stockmatrix',
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
  verification: {
    google: '3SavpxZkoJOuLHdnV94F9xjHNL7rPyyTJjQGbfttv5g',
    other: {
      'naver-site-verification': '5ce857b8cfd4c2e2b15181ee3029b6fce6590c18',
    },
  },
  category: 'finance',
  classification: 'Business',
  referrer: 'origin-when-cross-origin',
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
          url: 'https://stockmatrix.co.kr/apple-icon',
          width: 512,
          height: 512,
          caption: 'Stock Matrix Logo',
        },
        image: {
          '@type': 'ImageObject',
          url: 'https://stockmatrix.co.kr/apple-icon',
          width: 512,
          height: 512,
        },
        sameAs: ['https://twitter.com/stockmatrix'],
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
        description: 'AI가 기술적 지표 기반으로 분석한 KOSPI·KOSDAQ 5개 종목의 기술적 분석 데이터를 매일 무료로 받아보세요',
        publisher: {
          '@id': 'https://stockmatrix.co.kr/#organization',
        },
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'Service',
        '@id': 'https://stockmatrix.co.kr/#service',
        name: 'Stock Matrix AI 주식 기술적 분석 뉴스레터',
        description: 'AI가 기술적 지표 기반으로 분석한 KOSPI·KOSDAQ 5개 종목의 기술적 분석 데이터를 매일 오전 7시 50분 무료로 발송. 투자 권유가 아닌 참고용 정보 제공.',
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
      </body>
    </html>
  );
}