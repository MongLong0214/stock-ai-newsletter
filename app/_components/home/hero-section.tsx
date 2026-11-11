'use client';

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { siteConfig } from '@/lib/constants/seo/config';
import CTAButton from "./cta-button";

interface HeroSectionProps {
  formatted: string;
}

function HeroSection({ formatted }: HeroSectionProps) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  });

  // 스크롤 시 살짝 내려가며 흐려진다. scale·blur는 글자를 뭉개서 쓰지 않는다(디자인 원칙).
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <section ref={ref} className="relative pt-32 pb-16 lg:pb-24 flex items-center justify-center px-6 lg:px-8 overflow-hidden" aria-labelledby="hero-heading">
      {/* Subtle gradient overlay with parallax - Enhanced movement */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.04)_0%,transparent_60%)] pointer-events-none"
        style={{ y: useTransform(scrollYProgress, [0, 1], [0, -150]) }} // -50 → -150px for more dramatic upward movement
        aria-hidden="true"
      />

      {/* 진입 애니메이션 없이 서버 HTML에서 바로 보인다 — opacity:0 시작은 JS 실행 전까지
          히어로가 비어 LCP를 늦추고, JS가 실패하면 첫 화면이 통째로 검게 남는다 */}
      <motion.div
        style={{ y, opacity }}
        className="max-w-5xl mx-auto text-center relative z-10"
      >
        <div>
          <h1
            id="hero-heading"
            className="font-extralight mb-6 lg:mb-8 tracking-[-0.02em] leading-[0.95]"
          >
            <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl text-emerald-500/80">AI가 분석한{' '}</span>
            <br />
            <span className="block text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal text-emerald-400">
              기술적 지표 데이터
            </span>
          </h1>
        </div>

        <div className="mb-8 max-w-3xl mx-auto text-center">
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-300 font-light leading-relaxed tracking-wide mb-1">
            매일 프리마켓 개장 30분 전 <span className="text-[10px] sm:text-xs md:text-sm lg:text-base text-slate-400">(7시 30분)</span>
          </p>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-300 font-light leading-relaxed tracking-wide mb-2">
            코스피·코스닥 종목 3개
          </p>
          <p className="text-xs sm:text-sm md:text-base text-slate-400 font-light tracking-wide">
            5초 구독 • 광고 없음 • 완전 무료
          </p>
          <p className="mt-8 md:mt-10 text-sm sm:text-base md:text-lg text-slate-400/95 leading-relaxed max-w-3xl mx-auto break-keep">
            <span className="block text-emerald-400/90">StockMatrix는 한국 주식 투자자를 위한 무료 AI 주식 분석 뉴스레터입니다.</span>
            매일 오전 7시 30분, AI가 30개 기술적 지표로 분석한 KOSPI·KOSDAQ 3종목을 이메일로 전달하며, 웹사이트에서는 {siteConfig.themeCountFloor}+ 테마 생명주기 분석을 제공합니다.
          </p>
        </div>

        <div>
          <CTAButton
            formatted={formatted}
            ariaLabel="Get started with AI stock intelligence"
            location="home_hero"
          />
        </div>
      </motion.div>
    </section>
  );
}

export default HeroSection;
