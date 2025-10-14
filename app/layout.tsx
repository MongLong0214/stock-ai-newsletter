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
  description: 'GPT, Claude, Gemini 3개 AI가 독립 분석한 KOSPI·KOSDAQ 9개 종목을 매일 무료로 받아보세요. 진입가, 손절가 포함. 데이터 기반 주식 투자 인사이트 제공.',
  keywords: [
    '주식 AI 추천',
    'AI 종목 분석',
    '무료 주식 뉴스레터',
    '코스피 추천',
    '코스닥 추천',
    'Stock Matrix',
    'GPT 주식 분석',
    'Claude 주식 분석',
    'Gemini 주식 분석',
    '주식 급등주',
    '주식 투자',
    '한국주식',
    '데이터 기반 투자',
    '주식 뉴스레터',
    '무료 주식 정보',
    '주식 종목 추천',
    '주식 매수 타이밍',
    '주식 손절가',
    '주식 진입가',
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
    description: 'GPT, Claude, Gemini 3개 AI가 독립 분석한 KOSPI·KOSDAQ 9개 종목을 매일 무료로 받아보세요. 진입가, 손절가 포함.',
    siteName: 'Stock Matrix',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Stock Matrix - 3개 AI 주식 분석 뉴스레터',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
    description: 'GPT, Claude, Gemini 3개 AI가 분석한 KOSPI·KOSDAQ 9개 종목을 매일 무료로',
    images: ['/og-image.png'],
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
    google: 'CnNmKy8q9qAVj8v6n2GFUfwkxDZuSqt8yoOWiE8wl24',
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
          url: 'https://stockmatrix.co.kr/og-image.png',
          width: 1200,
          height: 630,
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
        description: 'GPT, Claude, Gemini 3개 AI가 독립 분석한 KOSPI·KOSDAQ 9개 종목을 매일 무료로 받아보세요',
        publisher: {
          '@id': 'https://stockmatrix.co.kr/#organization',
        },
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'Service',
        '@id': 'https://stockmatrix.co.kr/#service',
        name: 'Stock Matrix AI 주식 분석 뉴스레터',
        description: 'GPT, Claude, Gemini 3개 AI가 독립 분석한 KOSPI·KOSDAQ 9개 종목을 매일 오전 7시 50분 무료로 발송',
        provider: {
          '@id': 'https://stockmatrix.co.kr/#organization',
        },
        serviceType: '주식 투자 정보 뉴스레터',
        areaServed: {
          '@type': 'Country',
          name: '대한민국',
        },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'KRW',
          availability: 'https://schema.org/InStock',
          description: '완전 무료 서비스',
        },
        audience: {
          '@type': 'Audience',
          audienceType: '주식 투자자',
        },
        category: 'Financial Services',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'AI 주식 분석 서비스',
          itemListElement: [
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'GPT 주식 분석',
                description: 'OpenAI GPT-4가 분석한 3개 종목 추천',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Claude 주식 분석',
                description: 'Anthropic Claude가 분석한 3개 종목 추천',
              },
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Gemini 주식 분석',
                description: 'Google Gemini가 분석한 3개 종목 추천',
              },
            },
          ],
        },
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