import type { Metadata } from 'next';
import { siteConfig } from '@/lib/constants/seo/config';

export const metadata: Metadata = {
  title: '주식 투자 블로그',
  description:
    'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다. Stock Matrix의 전문 블로그에서 투자 인사이트를 얻어가세요.',
  openGraph: {
    title: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
    url: `${siteConfig.domain}/blog`,
    siteName: siteConfig.serviceName,
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '주식 투자 블로그 | Stock Matrix',
    description:
      'AI 주식 분석, 뉴스레터 추천, 기술적 분석 가이드 등 주식 투자에 필요한 모든 정보를 제공합니다.',
  },
  alternates: {
    canonical: `${siteConfig.domain}/blog`,
  },
};

interface BlogLayoutProps {
  children: React.ReactNode;
}

export default function BlogLayout({ children }: BlogLayoutProps) {
  return (
    <div className="min-h-screen bg-black">
      {children}
    </div>
  );
}