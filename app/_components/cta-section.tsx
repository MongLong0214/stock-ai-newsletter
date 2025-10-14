import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CTASectionProps {
  formatted: string;
  longAnimationDuration: number;
  animationDuration: number;
  viewportMargin: string;
  isMobile: boolean;
  variant?: "mid" | "final";
}

function CTASection({
  formatted,
  longAnimationDuration,
  animationDuration,
  viewportMargin,
  isMobile,
  variant = "final"
}: CTASectionProps) {
  if (variant === "mid") {
    return (
      <section className="py-20 lg:py-24 px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: longAnimationDuration, ease: [0.19, 1, 0.22, 1] }}
            viewport={{ once: true, margin: viewportMargin }}
          >
            <h3 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 tracking-tight leading-tight">
              이 모든 지표를 분석한 결과를
              <br />
              <span className="font-light text-emerald-300">매일 아침 7시 50분</span>에 받아보세요
            </h3>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: animationDuration, delay: isMobile ? 0.1 : 0.2, ease: [0.19, 1, 0.22, 1] }}
              viewport={{ once: true }}
              className="mb-8"
            >
              <p className="text-sm sm:text-base md:text-lg text-slate-400 font-light tracking-wide">
                5초 구독 • 광고 없음 • 완전 무료
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: animationDuration, delay: isMobile ? 0.15 : 0.3, ease: [0.19, 1, 0.22, 1] }}
              viewport={{ once: true }}
            >
              <Link href="/subscribe">
                <Button
                  size="lg"
                  className="group relative overflow-hidden bg-emerald-600 text-black hover:bg-emerald-500 text-lg font-semibold px-12 py-7 rounded-lg transition-all duration-700 ease-out-expo shadow-lg hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer"
                  aria-label="Subscribe to receive analysis every morning"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    {formatted} 후 메일 받기
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
                  </span>
                  <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20 lg:py-24 px-6 lg:px-8 relative" aria-labelledby="cta-heading">
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: longAnimationDuration, ease: [0.19, 1, 0.22, 1] }}
          viewport={{ once: true, margin: viewportMargin }}
        >
          <h2 id="cta-heading" className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extralight mb-6 lg:mb-8 text-emerald-500/80 tracking-tight leading-tight">
            <span className="font-normal text-emerald-300">9개 종목</span>을 드립니다
          </h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: animationDuration, delay: isMobile ? 0.1 : 0.2, ease: [0.19, 1, 0.22, 1] }}
            viewport={{ once: true }}
            className="mb-8 lg:mb-10"
          >
            <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-slate-300 font-light leading-relaxed tracking-wide mb-8">
              <span className="text-emerald-300/90">GPT-5</span>가 선택한 3개
              <br />
              <span className="text-emerald-300/90">Claude</span>가 선택한 3개
              <br />
              <span className="text-emerald-300/90">Gemini</span>가 선택한 3개
            </p>
            <p className="text-base sm:text-lg md:text-xl text-slate-300 font-light tracking-wide leading-relaxed mb-6">
              하나의 정답을 강요하지 않습니다
              <br />
              <span className="text-emerald-300/80">세 가지 시각, 아홉 가지 가능성</span>
            </p>
            <p className="text-sm sm:text-base md:text-lg text-slate-400 font-light tracking-wide">
              5초 구독 • 광고 없음 • 완전 무료
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: animationDuration, delay: isMobile ? 0.15 : 0.3, ease: [0.19, 1, 0.22, 1] }}
            viewport={{ once: true }}
          >
            <Link href="/subscribe">
              <Button
                size="lg"
                className="group relative overflow-hidden bg-emerald-600 text-black hover:bg-emerald-500 text-lg font-semibold px-12 py-7 rounded-lg shadow-lg hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-all duration-700 ease-out-expo tracking-wide cursor-pointer"
                aria-label="9개 종목 무료로 받기"
              >
                <span className="relative z-10 flex items-center gap-3">
                  {formatted} 후 메일 받기
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300 ease-out-expo" aria-hidden="true" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity duration-700" aria-hidden="true" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default CTASection;