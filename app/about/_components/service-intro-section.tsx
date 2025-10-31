'use client';

import React, {JSX} from 'react';
import { motion } from 'framer-motion';


function ServiceIntroSection(): JSX.Element {
  return (
    <section
      className="relative py-8 lg:py-20 px-6 lg:px-8"
      aria-labelledby="service-intro-heading"
    >
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-12"
        >
          <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
            About Service
          </p>
          <h2
            id="service-intro-heading"
            className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4"
          >
            AI 주식 분석 무료 뉴스레터
          </h2>
          <p className="text-lg text-slate-300 font-light tracking-wide leading-relaxed">
            매일 아침 받는 기술적 분석 데이터로 투자 인사이트를 얻으세요
          </p>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="space-y-6 text-slate-300 font-light tracking-wide leading-relaxed"
        >
          <p className="text-base md:text-lg">
            <strong className="text-emerald-400 font-normal">Stock Matrix</strong>는{' '}
            <strong className="font-normal">AI 주식 분석</strong> 전문 무료 뉴스레터입니다.{' '}
            <strong className="font-normal">RSI(상대강도지수)</strong>,{' '}
            <strong className="font-normal">MACD(이동평균수렴확산)</strong>,{' '}
            <strong className="font-normal">볼린저밴드</strong>, <strong className="font-normal">이동평균선</strong>,{' '}
            <strong className="font-normal">스토캐스틱</strong> 등 <strong className="font-normal">30개 기술적 지표</strong>를
            활용하여 <strong className="font-normal">KOSPI</strong>와 <strong className="font-normal">KOSDAQ</strong> 시장의
            주요 종목을 분석합니다.
          </p>

          <p className="text-base md:text-lg">
            매일 <strong className="text-emerald-400 font-normal">오전 7시 50분</strong>,
            장 시작 <strong className="font-normal">10분 전</strong>에 무료로 이메일로{' '}
            <strong className="font-normal">기술적 분석 데이터</strong>를 받아보실 수 있습니다. 장
            시작 전에 미리 시장 동향을 파악하고 당일 투자 계획을 세울 수
            있도록 도와드립니다.
          </p>

          {/* Feature Highlights Box */}
          <div className="bg-slate-800/50 border border-emerald-500/20 rounded-3xl p-6 md:p-8 my-8 transition-all duration-700 hover:border-emerald-500/40">
            <h3 className="text-xl md:text-2xl font-light text-white mb-6 flex items-center gap-2">
              <svg
                className="w-6 h-6 text-emerald-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              주요 특징
            </h3>
            <ul className="space-y-3" role="list">
              <li className="flex items-center">
                <svg
                  className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0"
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
                <span>
                  <strong className="text-white font-normal">완전 무료</strong>: 숨겨진
                  비용 없이 영구적으로 무료로 제공
                </span>
              </li>
              <li className="flex items-center">
                <svg
                  className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0"
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
                <span>
                  <strong className="text-white font-normal">30개 기술지표 분석</strong>:
                  RSI, MACD, 볼린저밴드 등 종합적인 기술적 분석
                </span>
              </li>
              <li className="flex items-center">
                <svg
                  className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0"
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
                <span>
                  <strong className="text-white font-normal">
                    매일 오전 7시 50분 발송
                  </strong>
                  : 장 시작 전 최신 분석 데이터 제공
                </span>
              </li>
              <li className="flex items-center">
                <svg
                  className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0"
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
                <span>
                  <strong className="text-white font-normal">KOSPI·KOSDAQ 종목</strong>:
                  한국 주식시장 주요 종목 선별 분석
                </span>
              </li>
              <li className="flex items-center">
                <svg
                  className="w-5 h-5 text-emerald-400 mr-3 flex-shrink-0"
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
                <span>
                  <strong className="text-white font-normal">참고용 데이터</strong>: 투자
                  권유가 아닌 기술적 분석 정보만 제공
                </span>
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="text-base md:text-lg">
            <strong className="text-white font-normal">Stock Matrix</strong>는 투자 권유나
            매매 추천이 아닌{' '}
            <strong className="font-normal">참고용 기술적 분석 데이터</strong>만 제공하는{' '}
            <strong className="font-normal">무료 투자 뉴스레터</strong>입니다. AI가 분석한{' '}
            <strong className="font-normal">기술적 지표</strong> 데이터를 바탕으로 투자자 본인의
            판단과 책임 하에 투자 결정을 내리시기 바랍니다.
          </p>

          {/* Legal Notice */}
          <div
            className="bg-slate-800/30 border-l-4 border-slate-600 rounded p-4"
            role="note"
            aria-label="법적 고지사항"
          >
            <p className="text-sm text-slate-400 leading-relaxed">
              <strong className="text-slate-300 font-normal">법적 고지:</strong> 본
              서비스는 금융투자협회 미등록 서비스로, 투자자문이나 투자일임
              서비스가 아닙니다. 모든 투자 판단과 그에 따른 결과는 투자자
              본인의 책임입니다.
            </p>
          </div>
        </motion.div>
      </div>

      <SchemaOrgStructuredData />
    </section>
  );
}

/**
 * Schema.org Structured Data Component
 *
 * Embeds JSON-LD structured data for search engine optimization.
 * This enables:
 * - Google Rich Snippets (enhanced search results)
 * - Better content understanding by search engines
 * - Improved SEO performance for service introduction page
 *
 * @see https://schema.org/WebPage
 * @see https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
 */
function SchemaOrgStructuredData() {
  const schemaData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Stock Matrix 서비스 소개 | AI 주식 분석 무료 뉴스레터',
    description:
      'Stock Matrix는 RSI, MACD, 볼린저밴드 등 30가지 기술적 지표를 활용한 AI 주식 분석 무료 뉴스레터입니다. 매일 오전 7시 50분 KOSPI·KOSDAQ 종목 분석을 이메일로 받아보세요.',
    url: 'https://stockmatrix.co.kr/about',
    inLanguage: 'ko-KR',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Stock Matrix',
      url: 'https://stockmatrix.co.kr',
    },
    about: {
      '@type': 'Service',
      name: 'Stock Matrix AI 주식 분석 뉴스레터',
      description:
        '30개 기술적 지표를 활용한 AI 주식 분석 무료 뉴스레터 서비스',
      serviceType: 'AI 주식 분석',
      provider: {
        '@type': 'Organization',
        name: 'Stock Matrix',
        url: 'https://stockmatrix.co.kr',
      },
      areaServed: 'KR',
      availableLanguage: 'ko',
    },
    keywords: [
      'AI 주식 분석',
      '무료 뉴스레터',
      'RSI',
      'MACD',
      '볼린저밴드',
      'KOSPI',
      'KOSDAQ',
      '기술적 분석',
      '주식 투자',
    ],
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

export default ServiceIntroSection;