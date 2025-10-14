import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '무료 구독 신청',
  description: 'Stock Matrix AI 주식 분석 뉴스레터를 무료로 구독하세요. GPT, Claude, Gemini 3개 AI가 분석한 KOSPI·KOSDAQ 9개 종목을 매일 오전 7시 50분에 받아보실 수 있습니다.',
  keywords: [
    '주식 뉴스레터 구독',
    '무료 주식 정보',
    'AI 주식 추천 신청',
    '주식 이메일 구독',
    'Stock Matrix 구독',
  ],
  alternates: {
    canonical: '/subscribe',
  },
  openGraph: {
    title: 'Stock Matrix 무료 구독 신청',
    description: '3개 AI가 분석한 9개 종목을 매일 무료로 받아보세요',
    url: 'https://stockmatrix.co.kr/subscribe',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Stock Matrix 구독 신청',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stock Matrix 무료 구독 신청',
    description: '3개 AI가 분석한 9개 종목을 매일 무료로',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function SubscribeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}