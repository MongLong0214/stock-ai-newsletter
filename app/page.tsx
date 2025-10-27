'use client';

import React from "react";
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

  const animationDuration = isMobile ? 0.15 : 0.8;
  const longAnimationDuration = isMobile ? 0.2 : 0.9;
  const viewportMargin = isMobile ? '0px' : '-100px';

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
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
        indicators={TECHNICAL_INDICATORS_DATA}
      />

      {/* CTA Section */}
      <CTASection
        formatted={formatted}
        longAnimationDuration={longAnimationDuration}
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
      />
    </div>
  );
}