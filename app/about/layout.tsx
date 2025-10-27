import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stock Matrix 서비스 소개 | AI 주식 분석 무료 뉴스레터',
  description:
    'Stock Matrix는 RSI, MACD, 볼린저밴드 등 30가지 기술적 지표를 활용한 AI 주식 분석 무료 뉴스레터입니다. 매일 오전 7시 50분 KOSPI·KOSDAQ 종목 분석을 이메일로 받아보세요.',
  keywords: [
    'Stock Matrix',
    'AI 주식 분석',
    '무료 뉴스레터',
    '기술적 분석',
    'RSI',
    'MACD',
    '볼린저밴드',
    'KOSPI',
    'KOSDAQ',
  ],
  openGraph: {
    title: 'Stock Matrix 서비스 소개',
    description: 'AI가 분석한 기술적 지표 데이터를 매일 무료로 받아보세요',
    type: 'website',
    url: 'https://stockmatrix.co.kr/about',
  },
};

export default function AboutLayout({
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