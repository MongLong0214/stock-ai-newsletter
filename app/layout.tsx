import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import Navigation from './_components/shared/navigation';
import Footer from './_components/shared/footer';
import QueryProvider from './_components/shared/providers/query-provider';
import ScrollToTop from '@/components/scroll-to-top';
import GoogleAnalytics from '@/components/analytics/google-analytics';
import { shouldRenderAnalytics } from './analytics-env';
import {
  siteConfig,
  metadataConfig,
  socialConfig,
  schemaConfig,
  allKeywords,
  withOgImageVersion,
} from '@/lib/constants/seo';
import { schemaIds } from '@/lib/constants/seo/config';

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.domain),
  applicationName: 'StockMatrix',
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
    types: {
      'application/rss+xml': `${siteConfig.domain}/feed.xml`,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: siteConfig.domain,
    title: metadataConfig.title,
    description: metadataConfig.description,
    siteName: 'StockMatrix',
    images: [
      {
        url: withOgImageVersion('/opengraph-image'),
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
    images: [withOgImageVersion('/opengraph-image')],
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
      ...(process.env.BING_SITE_VERIFICATION ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } : {}),
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  category: 'finance',
  classification: 'Business',
  referrer: 'origin-when-cross-origin',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'StockMatrix',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
};

export { shouldRenderAnalytics } from './analytics-env';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.replace(/[^A-Z0-9\-]/gi, '') ?? '';
  // Microsoft Clarity 프로젝트 ID (공개 클라이언트 ID). 히트맵·세션 레코딩용.
  const clarityId = 'y5lv55fx8e';
  const shouldRenderVercelTelemetry =
    process.env.VERCEL === '1' || Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);
  // 로컬·E2E 트래픽이 프로덕션 GA4 속성을 오염시켜 유입 페이지 2위가 E2E mock 테마였다.
  const renderAnalytics = shouldRenderAnalytics();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': schemaIds.organization,
        name: siteConfig.serviceName,
        alternateName: ['Stock Matrix', siteConfig.serviceNameKo],
        url: siteConfig.domain,
        logo: `${siteConfig.domain}/icon-512.png`,
        image: {
          '@type': 'ImageObject',
          url: `${siteConfig.domain}/icon-512.png`,
          width: 512,
          height: 512,
        },
        sameAs: [
          socialConfig.twitter,
          socialConfig.instagram,
          socialConfig.threads,
          'https://github.com/MongLong0214/stock-ai-newsletter',
          'https://www.npmjs.com/package/stockmatrix-mcp',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          availableLanguage: ['Korean'],
          email: 'aistockmatrix@gmail.com',
        },
        foundingDate: '2024-01-01',
        slogan: '매일 오전 7시 30분, 무료 AI 주식 분석 뉴스레터',
        description: schemaConfig.serviceDesc,
        knowsAbout: [
          '주식 기술적 분석',
          'AI 투자 분석',
          'RSI 지표',
          'MACD 분석',
          '볼린저밴드',
          '이동평균선',
          '테마 생명주기 분석',
          'KOSPI',
          'KOSDAQ',
        ],
        areaServed: { '@type': 'Country', name: 'South Korea' },
        disambiguatingDescription:
          "Google Play의 'Stock Matrix - Alerts & News'(com.stockmatrix.app) 앱과 무관한 별개 서비스입니다. StockMatrix는 웹사이트와 이메일 뉴스레터로만 제공됩니다.",
      },
      {
        '@type': 'WebSite',
        '@id': schemaIds.website,
        url: siteConfig.domain,
        name: siteConfig.serviceName,
        alternateName: 'StockMatrix AI 주식 분석 뉴스레터',
        description: schemaConfig.websiteDesc,
        publisher: { '@id': schemaIds.organization },
        inLanguage: 'ko-KR',
        // SearchAction 제거: /blog/tag/{term}은 정확 태그 매칭만 되고 그 외에는 404라
        // Sitelinks Search Box가 사용자 쿼리를 받으면 거의 항상 실패한다. 실제 검색 라우트가 생기면 복구.
        potentialAction: [
          {
            '@type': 'SubscribeAction',
            target: `${siteConfig.domain}/subscribe`,
            object: {
              '@type': 'Service',
              name: 'StockMatrix 무료 뉴스레터',
              description: '매일 오전 7:30 AI가 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목 정보를 무료 이메일로 발송',
            },
          },
        ],
      },
      {
        '@type': 'Service',
        '@id': schemaIds.service,
        name: schemaConfig.serviceName,
        description: schemaConfig.serviceDesc,
        provider: { '@id': schemaIds.organization },
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
        hoursAvailable: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '07:00',
          closes: '08:00',
        },
        availableChannel: {
          '@type': 'ServiceChannel',
          serviceType: 'Email Newsletter',
          availableLanguage: 'Korean',
        },
      },
      {
        '@type': 'NewsMediaOrganization',
        '@id': `${siteConfig.domain}/#newsletter`,
        name: 'StockMatrix 주식 뉴스레터',
        alternateName: '스탁매트릭스 투자 뉴스레터',
        description: '한국 주식 투자자를 위한 무료 이메일 뉴스레터 서비스. AI가 분석한 시장 인사이트와 종목 정보를 매일 오전 7시 30분 제공.',
        parentOrganization: { '@id': schemaIds.organization },
        inLanguage: 'ko-KR',
        about: ['주식 투자', '시장 분석', '기술적 지표', '종목 인사이트', '경제 뉴스'],
        audience: {
          '@type': 'Audience',
          audienceType: ['개인 투자자', '주식 초보자', '기술적 분석 관심자'],
          geographicArea: {
            '@type': 'Country',
            name: '대한민국',
          },
        },
        isAccessibleForFree: true,
        publishingPrinciples: `${siteConfig.domain}/about`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: '홈',
            item: siteConfig.domain,
          },
        ],
      },
    ],
  };

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        {renderAnalytics ? (
          <>
            <link rel="preconnect" href="https://www.googletagmanager.com" />
            <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="anonymous" />
          </>
        ) : null}
        {gaId && renderAnalytics ? (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}',{send_page_view:true});`,
              }}
            />
          </>
        ) : null}
        {clarityId && renderAnalytics ? (
          <Script
            id="ms-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`,
            }}
          />
        ) : null}
        {/* next/script는 afterInteractive로 클라이언트에서 주입돼 JS 미실행 크롤러(GPTBot·ClaudeBot·PerplexityBot)가 못 본다. 평문 script로 SSR. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className={notoSansKR.className} suppressHydrationWarning>

        <QueryProvider>
          <Navigation />
          {children}
          <Footer />
          <ScrollToTop />
        </QueryProvider>

        {shouldRenderVercelTelemetry ? <Analytics /> : null}
        {renderAnalytics ? <GoogleAnalytics /> : null}
      </body>
    </html>
  );
}
