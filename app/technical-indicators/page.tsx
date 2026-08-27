import AnimatedBackground from '@/components/animated-background';
import { siteConfig } from '@/lib/constants/seo';
import {
  generateBreadcrumbSchema,
  breadcrumbPatterns,
} from '@/lib/constants/seo/breadcrumb-schema';
import TechnicalIndicatorsExplanationSection from './_components/technical-indicators-explanation-section';

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

const TechnicalIndicatorsPage = () => {
  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      <TechnicalIndicatorsExplanationSection />

      <script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, '\\u003c') }}
      />

      <script
        id="article-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c') }}
      />
    </main>
  );
};

export default TechnicalIndicatorsPage;
