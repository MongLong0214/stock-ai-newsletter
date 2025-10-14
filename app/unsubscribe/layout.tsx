import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '구독 취소',
  description: 'Stock Matrix AI 주식 분석 뉴스레터 구독을 취소합니다. 언제든지 다시 구독하실 수 있습니다.',
  alternates: {
    canonical: '/unsubscribe',
  },
  openGraph: {
    title: 'Stock Matrix 구독 취소',
    description: 'Stock Matrix 뉴스레터 구독 취소',
    url: 'https://stockmatrix.co.kr/unsubscribe',
    type: 'website',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}