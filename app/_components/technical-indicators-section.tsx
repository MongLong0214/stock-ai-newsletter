'use client';

import { motion, useScroll, useTransform } from "framer-motion";
import { useStaggerReveal } from "@/hooks/use-reveal";
import { useRef } from "react";

interface TechnicalIndicator {
  title: string;
  items: readonly string[];
  gradient: string;
}

interface TechnicalIndicatorsSectionProps {
  isMobile: boolean;
  indicators: readonly TechnicalIndicator[];
}

function TechnicalIndicatorsSection({
  isMobile,
  indicators
}: TechnicalIndicatorsSectionProps) {
  const { ref, isInView, getDelay } = useStaggerReveal<HTMLDivElement>({
    once: true,
    amount: isMobile ? 0.1 : 0.2,
    staggerDelay: isMobile ? 40 : 100,
  });

  const parallaxRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: parallaxRef,
    offset: ["start end", "end start"]
  });

  // Parallax for heading - Simple and smooth
  const headingY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section ref={parallaxRef} className="py-12 lg:py-16 px-6 lg:px-8 relative" aria-labelledby="indicators-heading">
      <div ref={ref} className="max-w-7xl mx-auto">
        <motion.h2
          id="indicators-heading"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: isMobile ? 0.5 : 0.8, ease: [0.19, 1, 0.22, 1] }}
          style={{
            y: headingY
          }}
          className="text-3xl sm:text-4xl md:text-5xl font-extralight mb-12 lg:mb-16 text-center text-emerald-500/80 tracking-tight relative z-20"
        >
          <span className="relative inline-block">
            <span className="relative z-10">AI가 분석하는 기술적 지표</span>
            {/* Glow effect layer */}
            <motion.span
              className="absolute inset-0 blur-xl opacity-50"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.4) 0%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              aria-hidden="true"
            />
          </span>
        </motion.h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {indicators.map((category, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: isMobile ? 40 : 60, scale: 0.95 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{
                duration: isMobile ? 0.5 : 0.8,
                delay: getDelay(index),
                ease: [0.19, 1, 0.22, 1]
              }}
              className="group relative will-change-transform"
              style={{ transform: 'translateZ(0)' }}
            >
              <div className="relative p-6 lg:p-8 rounded-3xl glass-morphism border border-emerald-500/20 transition-all duration-700 ease-out-expo group-hover:border-emerald-500/40 group-hover:shadow-[0_0_40px_rgba(16,185,129,0.1)] overflow-hidden h-full">
                <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out-expo`} aria-hidden="true" />

                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[2s] ease-out-expo" aria-hidden="true" />
                </div>

                <div className="relative z-10">
                  <h3 className="text-xl lg:text-2xl font-normal mb-6 text-emerald-300 tracking-tight group-hover:text-emerald-200 transition-colors duration-500">
                    {category.title}
                  </h3>
                  <ul className="space-y-3">
                    {category.items.map((item, itemIndex) => (
                      <li
                        key={itemIndex}
                        className="text-xs lg:text-sm text-slate-300 font-light leading-relaxed tracking-wide group-hover:text-slate-300 transition-colors duration-500 flex items-start"
                      >
                        <span className="text-emerald-500/60 mr-2 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{
                  background: 'linear-gradient(135deg, transparent 0%, rgba(16,185,129,0.1) 50%, transparent 100%)',
                  padding: '1px',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude'
                }} aria-hidden="true" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TechnicalIndicatorsSection;