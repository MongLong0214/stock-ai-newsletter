import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '자주 묻는 질문 | Stock Matrix - 무료 AI 주식 분석 뉴스레터',
  description:
    'Stock Matrix AI 주식 분석 뉴스레터에 대해 자주 묻는 질문과 답변입니다. 무료 구독, 기술적 분석 지표, 서비스 이용 방법 등을 확인하세요.',
  keywords: [
    'Stock Matrix FAQ',
    'AI 주식 분석',
    '무료 뉴스레터',
    '기술적 분석',
    'RSI',
    'MACD',
    'KOSPI',
    'KOSDAQ',
    '자주 묻는 질문',
    '무료 주식 정보',
    '투자 뉴스레터',
  ],
  openGraph: {
    title: 'FAQ - Stock Matrix AI 주식 분석',
    description: '무료 AI 주식 분석 뉴스레터에 대한 자주 묻는 질문',
    type: 'website',
    url: 'https://stockmatrix.co.kr/faq',
  },
};

export default function FAQLayout({
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