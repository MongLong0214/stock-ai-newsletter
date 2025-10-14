'use client';

import React from "react";
import AnimatedBackground from "@/components/animated-background";
import { useCountdownToTomorrow } from "@/hooks/use-countdown-to-tomorrow";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { FEATURES_DATA, TECHNICAL_INDICATORS_DATA } from "./constants/home-page";
import Navigation from "./_components/navigation";
import Footer from "./_components/footer";
import HeroSection from "./_components/hero-section";
import EmailPreviewSection from "./_components/email-preview-section";
import PhilosophySection from "./_components/philosophy-section";
import TechnicalIndicatorsSection from "./_components/technical-indicators-section";
import FeaturesSection from "./_components/features-section";
import CTASection from "./_components/cta-section";

export default function HomePage() {
  const { formatted } = useCountdownToTomorrow();
  const isMobile = useIsMobile();

  const animationDuration = isMobile ? 0.2 : 0.8;
  const longAnimationDuration = isMobile ? 0.25 : 0.9;
  const viewportMargin = isMobile ? '100px' : '-100px';

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,255,65,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <HeroSection formatted={formatted} />

      {/* Email Preview Section */}
      <EmailPreviewSection />

      {/* Core Philosophy Section */}
      <PhilosophySection
        longAnimationDuration={longAnimationDuration}
        viewportMargin={viewportMargin}
      />

      {/* Technical Indicators Section */}
      <TechnicalIndicatorsSection
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
        indicators={TECHNICAL_INDICATORS_DATA}
      />

      {/* Mid CTA Section */}
      <CTASection
        formatted={formatted}
        longAnimationDuration={longAnimationDuration}
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
        variant="mid"
      />

      {/* Features Grid */}
      <FeaturesSection
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
        features={FEATURES_DATA}
      />

      {/* Final CTA Section */}
      <CTASection
        formatted={formatted}
        longAnimationDuration={longAnimationDuration}
        animationDuration={animationDuration}
        viewportMargin={viewportMargin}
        isMobile={isMobile}
        variant="final"
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}