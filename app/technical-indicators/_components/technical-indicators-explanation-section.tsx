'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { technicalIndicatorsContent } from '@/lib/constants/seo/technical-indicators-content';

function TechnicalIndicatorsExplanationSection() {
  const { introduction, mainIndicators, aiIntegration, conclusion } =
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

        <ConclusionCTA content={conclusion.content} />
      </div>

      <SchemaOrgStructuredData />
    </section>
  );
}

/**
 * Section Header Component
 * Displays the main title and introduction text
 */
interface SectionHeaderProps {
  title: string;
  introduction: string;
}

function SectionHeader({ title, introduction }: SectionHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="text-center mb-12"
    >
      <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
        Technical Indicators
      </p>
      <h2
        id="technical-indicators-heading"
        className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4"
      >
        {title}
      </h2>
      <div
        className="text-base md:text-lg text-slate-300 font-light tracking-wide leading-relaxed max-w-3xl mx-auto"
        dangerouslySetInnerHTML={{ __html: introduction }}
      />
    </motion.header>
  );
}

/**
 * Indicators Grid Component
 * Displays technical indicators in a responsive grid with consistent card heights
 */
interface Indicator {
  id?: string;
  name: string;
  keyword: string;
  description: string;
  usage: string;
}

interface IndicatorsGridProps {
  indicators: Indicator[];
}

function IndicatorsGrid({ indicators }: IndicatorsGridProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mb-16"
    >
      <h3 className="text-2xl md:text-3xl font-extralight text-emerald-500/80 tracking-tight mb-8 text-center">
        {technicalIndicatorsContent.mainIndicators.heading}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {indicators.map((indicator) => (
          <IndicatorCard key={indicator.keyword} indicator={indicator} />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Individual Indicator Card Component
 *
 * Displays a single technical indicator with:
 * - Icon and name header
 * - Description (variable length)
 * - Usage section (fixed at bottom)
 *
 * Layout uses flexbox to ensure usage section is always at card bottom
 * regardless of description length, creating visual consistency.
 */
interface IndicatorCardProps {
  indicator: Indicator;
}

function IndicatorCard({ indicator }: IndicatorCardProps) {
  const indicatorId = indicator.id || indicator.keyword.split(' ')[0].toLowerCase();

  return (
    <article
      id={indicatorId}
      className="group flex flex-col rounded-3xl p-6 transition-all duration-700 scroll-mt-24 bg-slate-800/50 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-slate-800/70 hover:shadow-lg hover:shadow-emerald-500/10"
    >
      {/* Header: Icon and Name */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 p-3 bg-emerald-600/10 rounded-3xl text-emerald-400 group-hover:bg-emerald-600/20 transition-colors duration-700">
          <IndicatorIcon name={indicator.name} />
        </div>
        <div className="flex-1">
          <h4 className="text-xl font-light text-white mb-1 group-hover:text-emerald-400 transition-colors duration-700">
            {indicator.name}
          </h4>
          <span className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider">
            {indicator.keyword}
          </span>
        </div>
      </div>

      {/* Description - flexible height */}
      <div
        className="text-sm text-slate-300 font-light tracking-wide leading-relaxed mb-4 flex-grow"
        dangerouslySetInnerHTML={{ __html: indicator.description }}
      />

      {/* Usage Section - fixed at bottom with mt-auto */}
      <div className="flex items-center gap-2 pt-4 border-t border-slate-700/50 mt-auto">
        <svg
          className="w-4 h-4 text-emerald-400 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-xs text-slate-400">
          <strong className="text-emerald-400">활용법:</strong>{' '}
          {indicator.usage}
        </span>
      </div>
    </article>
  );
}

/**
 * AI Integration Section Component
 * Explains how AI analyzes 30+ technical indicators together
 */
interface AIIntegrationSectionProps {
  heading: string;
  content: string;
}

function AIIntegrationSection({
  heading,
  content,
}: AIIntegrationSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="bg-gradient-to-br from-slate-800/50 to-emerald-900/10 border border-emerald-500/20 rounded-3xl p-8 md:p-10 mb-12"
    >
      <h3 className="text-2xl md:text-3xl font-extralight text-emerald-500/80 tracking-tight mb-6">
        {heading}
      </h3>
      <div
        className="text-base text-slate-300 font-light tracking-wide leading-relaxed space-y-4 whitespace-pre-line"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </motion.div>
  );
}

/**
 * Conclusion CTA Component
 * Call-to-action section with subscription link
 */
interface ConclusionCTAProps {
  content: string;
}

function ConclusionCTA({ content }: ConclusionCTAProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="text-center bg-slate-800/30 border border-emerald-500/20 rounded-3xl p-8"
    >
      <div
        className="text-lg text-slate-200 font-light tracking-wide leading-relaxed mb-6"
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <Link
        href="/subscribe"
        className="inline-block px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-lg rounded-3xl transition-all duration-700 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
        aria-label="무료 구독하고 AI 기술적 분석 받아보기"
      >
        무료 구독하고 AI 분석 받아보기
      </Link>
    </motion.div>
  );
}

/**
 * Schema.org Structured Data Component
 *
 * Embeds JSON-LD structured data for search engine optimization.
 * This enables:
 * - Google Rich Snippets (enhanced search results)
 * - Better content understanding by search engines
 * - Improved SEO performance
 *
 * @see https://schema.org/Article
 * @see https://developers.google.com/search/docs/appearance/structured-data/article
 */
function SchemaOrgStructuredData() {
  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: technicalIndicatorsContent.seo.title,
    description: technicalIndicatorsContent.seo.description,
    author: {
      '@type': 'Organization',
      name: 'Stock Matrix',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Stock Matrix',
      url: 'https://stockmatrix.co.kr',
    },
    keywords: technicalIndicatorsContent.seo.keywords.join(', '),
    articleSection: 'Investment Education',
    inLanguage: 'ko-KR',
    educationalLevel: 'Beginner to Intermediate',
    learningResourceType: 'Educational Article',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schemaData),
      }}
    />
  );
}

/**
 * Indicator Icon Component
 *
 * Returns appropriate SVG icon based on indicator name.
 * All icons use consistent 24x24 viewBox with 2px stroke width.
 *
 * @param name - Indicator name (Korean)
 * @returns SVG icon element
 */
interface IndicatorIconProps {
  name: string;
}

function IndicatorIcon({ name }: IndicatorIconProps) {
  const iconProps = {
    className: 'w-8 h-8',
    fill: 'none',
    stroke: 'currentColor',
    viewBox: '0 0 24 24',
    'aria-hidden': true as const,
  };

  const strokeProps = {
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
  };

  if (name.includes('RSI')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
        />
      </svg>
    );
  }

  if (name.includes('MACD')) {
    return (
      <svg {...iconProps}>
        <path {...strokeProps} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    );
  }

  if (name.includes('볼린저')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    );
  }

  if (name.includes('이동평균')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    );
  }

  if (name.includes('스토캐스틱')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    );
  }

  if (name.includes('CCI')) {
    return (
      <svg {...iconProps}>
        <path {...strokeProps} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path {...strokeProps} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    );
  }

  if (name.includes('거래량')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }

  if (name.includes('ADX')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M3 21l18-18M9 21h12M3 9v12M9 3v12m0 0l3-3m-3 3l-3-3m12 0l-3 3m3-3v6"
        />
      </svg>
    );
  }

  if (name.includes('일목균형표')) {
    return (
      <svg {...iconProps}>
        <path
          {...strokeProps}
          d="M3 17l6-6 4 4 8-8M3 21h18M3 3v18M21 3v8M3 9h18M3 15h18"
        />
      </svg>
    );
  }

  // Default fallback icon
  return (
    <svg {...iconProps}>
      <path
        {...strokeProps}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
      />
    </svg>
  );
}

export default TechnicalIndicatorsExplanationSection;