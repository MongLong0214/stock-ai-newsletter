'use client';

import AnimatedBackground from '@/components/animated-background';
import ServiceIntroSection from './_components/service-intro-section';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <AnimatedBackground />

      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      <ServiceIntroSection />
    </div>
  );
}