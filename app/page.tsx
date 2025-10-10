'use client';

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import AnimatedBackground from "@/components/animated-background";

export default function HomePage() {
  const features = [
    {
      title: "GPT-5",
      description: "OpenAI • 현 시점 LLM 종합 성능 평가 1위",
      gradient: "from-green-500/10 via-emerald-500/5 to-transparent",
      delay: 0
    },
    {
      title: "Claude Opus 4.1",
      description: "Anthropic • 복잡한 추론 및 데이터 분석 특화",
      gradient: "from-lime-500/10 via-green-500/5 to-transparent",
      delay: 0.15
    },
    {
      title: "Gemini-2.5 Pro",
      description: "Google • 대용량 컨텍스트 처리 특화",
      gradient: "from-emerald-500/10 via-teal-500/5 to-transparent",
      delay: 0.3
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated Background */}
      <AnimatedBackground />

      {/* Scanline Effect */}
      <div className="fixed inset-0 pointer-events-none z-[1] opacity-[0.04]">
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,255,65,0.04)_50%)] bg-[length:100%_4px] animate-[matrix-scan_8s_linear_infinite]" aria-hidden="true" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-morphism-strong" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="group relative text-xl font-medium tracking-tight text-green-400 hover:text-green-300 transition-all duration-300 ease-out-expo focus:outline-none rounded-lg px-3 py-2 -mx-3 -my-2"
              aria-label="AI Stock Intel - Home"
            >
              <span className="relative z-10">AI‑Powered Stock Signals</span>
              <span className="absolute inset-0 rounded-lg bg-green-500/5 scale-0 group-hover:scale-100 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
            </Link>
            <Link href="/subscribe">
              <Button
                variant="outline"
                className="relative group overflow-hidden bg-black/50 border-green-500/30 text-green-400 hover:text-black hover:border-green-400 transition-all duration-500 ease-out-expo focus:ring-green-500/50 px-6 py-2.5 rounded-full cursor-pointer"
                aria-label="Subscribe to newsletter"
              >
                <span className="relative z-10 font-medium tracking-wide">무료 메일받기</span>
                <span className="absolute inset-0 bg-green-500 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out-expo origin-left" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 lg:px-8 pt-20 pb-20" aria-labelledby="hero-heading">
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.10)_0%,transparent_70%)] pointer-events-none" aria-hidden="true" />

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="max-w-6xl mx-auto text-center relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          >
            <h1
              id="hero-heading"
              className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-extralight mb-8 lg:mb-10 tracking-[-0.02em] leading-[0.95]"
            >
              <span className="text-green-400/90">3개의 AI가 계산</span>
              <br />
              <span className="font-normal bg-clip-text text-transparent bg-gradient-to-r from-green-300 via-green-400 to-green-300 bg-[length:200%_100%] animate-[matrix-shimmer_8s_linear_infinite]">
                1주 10% 수익 목표
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="mb-12 max-w-4xl mx-auto text-center"
          >
            <p className="text-xl sm:text-2xl md:text-3xl text-green-200/70 font-light leading-relaxed tracking-wide mb-1">
              매일 개장 10분 전
            </p>
              <p className="text-xl sm:text-2xl md:text-3xl text-green-200/70 font-light leading-relaxed tracking-wide mb-3">
                  코스피·코스닥 종목 3개
              </p>
            <p className="text-base sm:text-lg text-green-200/50 font-light tracking-wide">
              5초 구독 • 광고 없음 • 완전 무료
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
          >
            <Link href="/subscribe">
              <Button
                size="lg"
                className="group relative overflow-hidden bg-green-500 text-black hover:bg-green-400 text-lg font-semibold px-12 py-7 rounded-full transition-all duration-700 ease-out-expo shadow-[0_0_40px_rgba(0,255,65,0.3)] hover:shadow-[0_0_60px_rgba(0,255,65,0.5),0_0_100px_rgba(0,255,65,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 tracking-wide cursor-pointer"
                aria-label="Get started with AI stock intelligence"
              >
                <span className="relative z-10 flex items-center gap-3">
                  오전 8시 50분 메일받기
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-green-400 via-green-300 to-green-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Core Philosophy Section */}
      <section className="py-20 lg:py-28 px-6 lg:px-8 relative" aria-labelledby="philosophy-heading">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <h2 id="philosophy-heading" className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extralight mb-8 lg:mb-10 text-green-400/90 tracking-tight leading-tight">
              오로지 <span className="font-normal text-green-300">숫자</span>와 <span className="font-normal text-green-300">차트</span>로만
            </h2>
            <p className="text-xl sm:text-2xl md:text-3xl text-green-200/60 font-light leading-relaxed tracking-wide">
              감이 아닌 데이터, 추측이 아닌 신호
            </p>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 lg:py-24 px-6 lg:px-8 relative" aria-labelledby="features-heading">
        <div className="max-w-7xl mx-auto">
          <motion.h2
            id="features-heading"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-4xl sm:text-5xl md:text-6xl font-extralight mb-14 lg:mb-16 text-center text-green-400/90 tracking-tight"
          >
            3개 AI 모델
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature, index) => (
              <motion.article
                key={index}
                initial={{ opacity: 0, y: 60 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  delay: feature.delay,
                  ease: [0.19, 1, 0.22, 1]
                }}
                viewport={{ once: true, margin: "-100px" }}
                className="group relative"
                tabIndex={0}
                role="article"
                aria-label={`${feature.title} AI system`}
              >
                {/* Card container with glass morphism */}
                <div className={`relative p-8 lg:p-10 rounded-3xl glass-morphism border border-green-500/20 transition-all duration-700 ease-out-expo group-hover:border-green-500/40 group-focus:border-green-500/40 group-hover:shadow-[0_0_40px_rgba(0,255,65,0.1)] overflow-hidden`}>
                  {/* Animated gradient background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out-expo`} aria-hidden="true" />

                  {/* Shimmer effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[2s] ease-out-expo" aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div className="relative z-10">
                    <h3 className="text-3xl lg:text-4xl font-normal mb-4 text-green-300 tracking-tight group-hover:text-green-200 transition-colors duration-500">
                      {feature.title}
                    </h3>
                    <p className="text-sm lg:text-base text-green-200/60 font-light leading-relaxed tracking-wide group-hover:text-green-200/80 transition-colors duration-500">
                      {feature.description}
                    </p>
                  </div>

                  {/* Border glow effect */}
                  <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{
                    background: 'linear-gradient(135deg, transparent 0%, rgba(0,255,65,0.1) 50%, transparent 100%)',
                    padding: '1px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude'
                  }} aria-hidden="true" />
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-24 px-6 lg:px-8 relative" aria-labelledby="cta-heading">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}
          viewport={{ once: true, margin: "-100px" }}
          className="max-w-4xl mx-auto text-center relative z-10"
        >
          <h2 id="cta-heading" className="text-4xl sm:text-5xl md:text-6xl font-extralight mb-6 text-green-400/90 tracking-tight">
            지금 <span className="font-light text-green-300">받아보세요</span>
          </h2>
          <p className="text-lg text-green-200/60 mb-10 font-light tracking-wider">
            5초 구독 • 광고 없음 • 완전 무료
          </p>
          <Link href="/subscribe">
            <Button
              size="lg"
              className="group relative overflow-hidden bg-green-500 text-black hover:bg-green-400 text-lg font-semibold px-12 py-7 rounded-full shadow-[0_0_40px_rgba(0,255,65,0.3)] hover:shadow-[0_0_60px_rgba(0,255,65,0.5),0_0_100px_rgba(0,255,65,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 transition-all duration-700 ease-out-expo tracking-wide cursor-pointer"
              aria-label="무료로 구독하기"
            >
              <span className="relative z-10">오전 8시 50분 메일받기</span>
              <span className="absolute inset-0 bg-gradient-to-r from-green-400 via-green-300 to-green-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-green-500/10 py-12 px-6 lg:px-8 relative" role="contentinfo">
        <div className="max-w-7xl mx-auto text-center">
          <div className="text-sm text-green-300/40 leading-relaxed font-light tracking-wide space-y-2">
            <p>본 정보는 AI가 생성한 참고 자료이며, 투자 권유가 아닙니다.</p>
            <p>투자의 최종 결정은 본인의 판단과 책임 하에 이루어져야 합니다.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}