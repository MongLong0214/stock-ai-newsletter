import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface HeroSectionProps {
  formatted: string;
}

function HeroSection({ formatted }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pb-16 lg:pb-24 flex items-center justify-center px-6 lg:px-8" aria-labelledby="hero-heading">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.04)_0%,transparent_60%)] pointer-events-none" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
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
            <Button
              size="lg"
              className="group relative overflow-hidden bg-emerald-600 text-black hover:bg-emerald-500 text-base font-semibold px-10 py-6 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer"
              aria-label="Get started with AI stock intelligence"
            >
              <span className="relative z-10 flex items-center gap-2">
                {formatted} 후 메일 받기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" aria-hidden="true" />
              </span>
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default HeroSection;
