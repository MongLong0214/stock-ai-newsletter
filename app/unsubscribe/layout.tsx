import { Metadata } from 'next';
import { ReactNode } from 'react';
import { siteConfig, withOgImageVersion } from '@/lib/constants/seo/config';

export const metadata: Metadata = {
  title: '구독 취소',
  description: 'Stock Matrix AI 주식 분석 뉴스레터 구독을 취소합니다. 언제든지 다시 구독하실 수 있습니다.',
  alternates: {
    canonical: `${siteConfig.domain}/unsubscribe`,
  },
  openGraph: {
    title: 'Stock Matrix 구독 취소',
    description: 'Stock Matrix 뉴스레터 구독 취소',
    url: `${siteConfig.domain}/unsubscribe`,
    type: 'website',
    images: [
      {
        url: withOgImageVersion('/unsubscribe/opengraph-image'),
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 구독 취소',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Matrix 구독 취소',
    description: 'Stock Matrix 뉴스레터 구독 취소',
    images: [withOgImageVersion('/unsubscribe/opengraph-image')],
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
