'use client';

import { useEffect } from "react";
import AnimatedBackground from "@/components/animated-background";
import { useCountdownToTomorrow } from "@/hooks/use-countdown-to-tomorrow";
import { useIsMobile } from "@/hooks/use-is-mobile";
import HeroSection from "./hero-section";
import EmailPreviewSection from "./email-preview-section";
import ThemePreviewSection from "./theme-preview-section";
import TechnicalIndicatorsSection from "./technical-indicators-section";
import CTASection from "./cta-section";
import ServiceDefinitionSection from "./service-definition-section";

interface TechnicalIndicator {
  title: string;
  items: readonly string[];
  gradient: string;
}

interface HomePageClientProps {
  technicalIndicators: readonly TechnicalIndicator[];
}

export default function HomePageClient({ technicalIndicators }: HomePageClientProps) {
  const { formatted } = useCountdownToTomorrow();
  const isMobile = useIsMobile();

  // 페이지 로드 시 스크롤을 최상단으로 강제
  useEffect(() => {
    // 히스토리 스크롤 복원 비활성화
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // 스크롤을 최상단으로 이동
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      {/* 스캔라인 효과 */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      <HeroSection formatted={formatted} />
      <EmailPreviewSection />
      <ThemePreviewSection isMobile={isMobile} />
      <TechnicalIndicatorsSection isMobile={isMobile} indicators={technicalIndicators} />
      <CTASection formatted={formatted} />

      {/* AI 검색 최적화용 서비스 정의 */}
      <ServiceDefinitionSection />
    </div>
  );
}
