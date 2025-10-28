import type { Metadata } from 'next';
import ServiceIntroSection from '../_components/service-intro-section';

export const metadata: Metadata = {
  title: '서비스 소개 - Stock Matrix AI 주식 분석',
  description:
    'Stock Matrix는 30가지 기술적 지표를 AI로 분석하여 매일 오전 주식 투자 인사이트를 제공하는 무료 뉴스레터 서비스입니다. RSI, MACD, 볼린저밴드 등 기술적 분석을 이메일로 받아보세요.',
  alternates: {
    canonical: 'https://stockmatrix.co.kr/about',
  },
  openGraph: {
    title: '서비스 소개 - Stock Matrix AI 주식 분석',
    description: '매일 오전 7:50 AI가 30가지 기술적 지표로 분석한 주식 투자 인사이트',
    url: 'https://stockmatrix.co.kr/about',
    type: 'website',
  },
};

export default function AboutPage() {
  return <ServiceIntroSection />;
}