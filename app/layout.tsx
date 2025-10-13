import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
  description: '3개의 AI가 분석한 주간 급등 종목 추천. 매주 10% 수익 목표로 데이터 기반 투자 인사이트를 제공합니다.',
  keywords: ['주식', 'AI', '급등주', '주식 추천', '뉴스레터', 'Stock Matrix', '투자', '주식 분석'],
  authors: [{ name: 'Stock Matrix' }],
  creator: 'Stock Matrix',
  publisher: 'Stock Matrix',
  metadataBase: new URL('https://stockmatrix.co.kr'),
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: 'https://stockmatrix.co.kr',
    title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
    description: '3개의 AI가 분석한 주간 급등 종목 추천. 매주 10% 수익 목표',
    siteName: 'Stock Matrix',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Stock Matrix - AI 주식 분석',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'STOCK MATRIX - AI 주식 분석 뉴스레터',
    description: '3개의 AI가 분석한 주간 급등 종목 추천',
    images: ['/og-image.png'],
    creator: '@stockmatrix',
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
    google: 'your-google-verification-code',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}