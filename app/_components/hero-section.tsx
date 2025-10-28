'use client';

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRef } from "react";

interface HeroSectionProps {
  formatted: string;
}

function HeroSection({ formatted }: HeroSectionProps) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  });

  // Parallax effects - Enhanced for visibility
  const y = useTransform(scrollYProgress, [0, 1], [0, 400]); // 150 → 400px for dramatic movement
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]); // Slower fade
  const scale = useTransform(scrollYProgress, [0, 0.6], [1, 0.85]); // 0.95 → 0.85 for more noticeable shrink
  const blur = useTransform(scrollYProgress, [0, 0.6], [0, 10]); // Add blur effect

  return (
    <section ref={ref} className="relative pt-32 pb-16 lg:pb-24 flex items-center justify-center px-6 lg:px-8" aria-labelledby="hero-heading">
      {/* Subtle gradient overlay with parallax - Enhanced movement */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.04)_0%,transparent_60%)] pointer-events-none"
        style={{ y: useTransform(scrollYProgress, [0, 1], [0, -150]) }} // -50 → -150px for more dramatic upward movement
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        style={{ y, opacity, scale, filter: `blur(${blur}px)` }}
        className="max-w-5xl mx-auto text-center relative z-10"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
        >
          <h1
            id="hero-heading"
            className="font-extralight mb-6 lg:mb-8 tracking-[-0.02em] leading-[0.95]"
          >
            <span className="block text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl text-emerald-500/80">AI가 분석한</span>
            <br />
            <span className="block text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400">
              기술적 지표 데이터
            </span>
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
          className="mb-8 max-w-3xl mx-auto text-center"
        >
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-300 font-light leading-relaxed tracking-wide mb-1">
            매일 프리마켓 개장 10분 전 <span className="text-[10px] sm:text-xs md:text-sm lg:text-base text-slate-400">(7시 50분)</span>
          </p>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-300 font-light leading-relaxed tracking-wide mb-2">
            코스피·코스닥 종목 3개
          </p>
          <p className="text-xs sm:text-sm md:text-base text-slate-400 font-light tracking-wide">
            5초 구독 • 광고 없음 • 완전 무료
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
        >
          <Link href="/subscribe">
            <motion.button
              className="relative overflow-hidden bg-emerald-600 text-black text-base font-semibold px-10 py-6 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer border-0"
              aria-label="Get started with AI stock intelligence"
              initial="rest"
              whileHover="hover"
              whileTap="tap"
              variants={{
                rest: {
                  scale: 1,
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                },
                hover: {
                  scale: 1.05,
                  boxShadow: '0 20px 60px rgba(16, 185, 129, 0.4), 0 0 40px rgba(16, 185, 129, 0.2)',
                  transition: {
                    duration: 0.3,
                    ease: [0.19, 1, 0.22, 1],
                  },
                },
                tap: {
                  scale: 0.98,
                  boxShadow: '0 5px 15px rgba(0, 0, 0, 0.2)',
                  transition: {
                    duration: 0.1,
                  },
                },
              }}
            >
              <motion.span
                className="relative z-10"
                variants={{
                  rest: {},
                  hover: {},
                }}
              >
                {formatted} 후 메일 받기
              </motion.span>

              {/* Animated Background Gradient */}
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 rounded-lg"
                variants={{
                  rest: { opacity: 0 },
                  hover: {
                    opacity: 1,
                    transition: {
                      duration: 0.3,
                      ease: 'easeOut',
                    },
                  },
                }}
                aria-hidden="true"
              />

              {/* Glow Effect Layer */}
              <motion.span
                className="absolute inset-0 rounded-lg"
                variants={{
                  rest: {
                    boxShadow: '0 0 0px rgba(16, 185, 129, 0)',
                  },
                  hover: {
                    boxShadow: 'inset 0 0 20px rgba(255, 255, 255, 0.2)',
                    transition: {
                      duration: 0.3,
                    },
                  },
                }}
                aria-hidden="true"
              />
            </motion.button>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default HeroSection;
