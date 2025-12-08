/**
 * 기술적 지표 설명 섹션 (메인 컴포넌트)
 *
 * 기술적 지표 페이지의 핵심 콘텐츠를 렌더링합니다.
 *
 * 구성:
 * - SectionHeader: 페이지 제목 및 소개
 * - IndicatorsGrid: 주요 지표 9개 카드 그리드
 * - AIIntegrationSection: AI 분석 방식 설명
 * - SchemaOrgStructuredData: SEO 구조화 데이터
 */

'use client';

import { technicalIndicatorsContent } from '@/lib/constants/seo/technical-indicators-content';
import SectionHeader from './sections/section-header';
import IndicatorsGrid from './sections/indicators-grid';
import AIIntegrationSection from './sections/ai-integration-section';
import SchemaOrgStructuredData from './seo/schema-org-structured-data';

function TechnicalIndicatorsExplanationSection() {
  const { introduction, mainIndicators, aiIntegration } =
    technicalIndicatorsContent;

  return (
    <section
      className="relative py-8 lg:py-20 px-6 lg:px-8"
      aria-labelledby="technical-indicators-heading"
    >
      <div className="max-w-6xl mx-auto relative z-10">
        <SectionHeader
          title={technicalIndicatorsContent.title}
          introduction={introduction.content}
        />

        <IndicatorsGrid indicators={mainIndicators.indicators} />

        <AIIntegrationSection
          heading={aiIntegration.heading}
          content={aiIntegration.content}
        />
      </div>

      <SchemaOrgStructuredData />
    </section>
  );
}

export default TechnicalIndicatorsExplanationSection;