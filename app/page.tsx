'use client';

import React from "react";
import Script from "next/script";
import AnimatedBackground from "@/components/animated-background";
import { useCountdownToTomorrow } from "@/hooks/use-countdown-to-tomorrow";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {  TECHNICAL_INDICATORS_DATA } from "./constants/home-page";
import HeroSection from "./_components/hero-section";
import EmailPreviewSection from "./_components/email-preview-section";
import TechnicalIndicatorsSection from "./_components/technical-indicators-section";
import CTASection from "./_components/cta-section";

export default function HomePage() {
  const { formatted } = useCountdownToTomorrow();
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Hero Section */}
      <HeroSection formatted={formatted} />

      {/* Email Preview Section */}
      <EmailPreviewSection />

      {/* Technical Indicators Section */}
      <TechnicalIndicatorsSection
        isMobile={isMobile}
        indicators={TECHNICAL_INDICATORS_DATA}
      />

      {/* CTA Section */}
      <CTASection formatted={formatted} />

      {/* SoftwareApplication Schema for Homepage */}
      <Script
        id="software-application-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Stock Matrix',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web Browser',
            description:
              '매일 오전 7시 50분 AI가 30가지 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 제공하는 무료 주식 분석 뉴스레터',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'KRW',
              availability: 'https://schema.org/InStock',
            },
            applicationSubCategory: 'Investment Analysis',
            featureList: [
              'AI 기술적 분석',
              '30가지 지표 분석',
              'KOSPI·KOSDAQ 종목 분석',
              '매일 아침 이메일 발송',
              '무료 서비스',
            ],
            screenshot: 'https://stockmatrix.co.kr/opengraph-image',
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.8',
              ratingCount: '150',
            },
          }),
        }}
        strategy="afterInteractive"
      />
    </div>
  );
}