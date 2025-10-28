import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import Navigation from './_components/navigation';
import Footer from './_components/footer';
import {
  siteConfig,
  metadataConfig,
  socialConfig,
  schemaConfig,
  allKeywords,
} from '@/lib/constants/seo';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.domain),
  title: {
    default: metadataConfig.title,
    template: metadataConfig.titleTemplate,
  },
  description: metadataConfig.description,
  keywords: allKeywords,
  authors: [{ name: siteConfig.serviceName, url: siteConfig.domain }],
  creator: siteConfig.serviceName,
  publisher: siteConfig.serviceName,
  alternates: {
    canonical: siteConfig.domain,
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: siteConfig.domain,
    title: metadataConfig.title,
    description: metadataConfig.descriptionShort,
    siteName: siteConfig.serviceName,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: `${siteConfig.serviceName} - AI 주식 분석`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: metadataConfig.title,
    description: metadataConfig.descriptionShort,
    creator: socialConfig.handle,
    site: socialConfig.handle,
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
        '@id': `${siteConfig.domain}/#organization`,
        name: siteConfig.serviceName,
        url: siteConfig.domain,
        logo: {
          '@type': 'ImageObject',
          url: `${siteConfig.domain}/icon`,
          width: 512,
          height: 512,
          caption: `${siteConfig.serviceName} Logo`,
        },
        image: {
          '@type': 'ImageObject',
          url: `${siteConfig.domain}/icon`,
          width: 512,
          height: 512,
        },
        sameAs: [
          socialConfig.twitter,
          socialConfig.instagram,
          socialConfig.threads,
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          availableLanguage: ['Korean'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteConfig.domain}/#website`,
        url: siteConfig.domain,
        name: siteConfig.serviceName,
        description: schemaConfig.websiteDesc,
        publisher: {
          '@id': `${siteConfig.domain}/#organization`,
        },
        inLanguage: 'ko-KR',
      },
      {
        '@type': 'Service',
        '@id': `${siteConfig.domain}/#service`,
        name: schemaConfig.serviceName,
        description: schemaConfig.serviceDesc,
        provider: {
          '@id': `${siteConfig.domain}/#organization`,
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
        <Navigation />
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}