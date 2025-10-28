import Script from 'next/script';
import { siteConfig } from '@/lib/constants/seo';
import {
  generateBreadcrumbSchema,
  breadcrumbPatterns,
} from '@/lib/constants/seo/breadcrumb-schema';
import TechnicalIndicatorsExplanationSection from '../_components/technical-indicators-explanation-section';

export default function TechnicalIndicatorsPage() {
  const breadcrumbSchema = generateBreadcrumbSchema(
    breadcrumbPatterns.technicalIndicators
  );

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '30가지 기술적 지표로 분석하는 AI 주식 투자 전략',
    description:
      'RSI, MACD, 볼린저밴드 등 주식 기술적 분석 지표의 의미와 활용법 완벽 가이드',
    author: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      url: siteConfig.domain,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.serviceName,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.domain}/icon-512.png`,
        width: 512,
        height: 512,
      },
    },
    datePublished: '2025-01-15',
    dateModified: new Date().toISOString().split('T')[0],
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteConfig.domain}/technical-indicators`,
    },
    keywords: [
      'RSI 지표',
      'MACD 분석',
      '볼린저밴드',
      '이동평균선',
      '기술적 분석',
    ],
    articleSection: '투자 교육',
    inLanguage: 'ko-KR',
  };

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'AI로 기술적 지표를 활용하는 방법',
    description:
      '30가지 기술적 지표를 AI가 종합 분석하여 주식 투자에 활용하는 방법',
    step: [
      {
        '@type': 'HowToStep',
        name: 'RSI 지표 이해하기',
        text: 'RSI 70 이상은 과매수, 30 이하는 과매도 구간으로 매매 타이밍 포착',
        url: `${siteConfig.domain}/technical-indicators#rsi`,
      },
      {
        '@type': 'HowToStep',
        name: 'MACD 골든크로스 확인',
        text: 'MACD 선이 시그널 선을 상향 돌파하면 매수 신호',
        url: `${siteConfig.domain}/technical-indicators#macd`,
      },
      {
        '@type': 'HowToStep',
        name: '볼린저밴드 활용',
        text: '주가가 하단 밴드 접근 시 반등 기회, 상단 접근 시 조정 가능성',
        url: `${siteConfig.domain}/technical-indicators#bollinger`,
      },
      {
        '@type': 'HowToStep',
        name: 'AI 종합 분석 확인',
        text: 'Stock Matrix AI가 30개 지표를 종합하여 매일 7:50 이메일 발송',
        url: `${siteConfig.domain}/subscribe`,
      },
    ],
    totalTime: 'PT10M',
    tool: {
      '@type': 'HowToTool',
      name: 'Stock Matrix AI',
    },
  };

  return (
    <>
      <TechnicalIndicatorsExplanationSection />

      {/* Breadcrumb Schema */}
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        strategy="afterInteractive"
      />

      {/* Article Schema */}
      <Script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        strategy="afterInteractive"
      />

      {/* HowTo Schema */}
      <Script
        id="howto-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
        strategy="afterInteractive"
      />
    </>
  );
}