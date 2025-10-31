'use client';

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import CTAButton from "./cta-button";

interface CTASectionProps {
  formatted: string;
}

function CTASection({ formatted }: CTASectionProps) {
  const { ref, isInView } = useReveal<HTMLElement>({
    once: true,
    amount: 0.3,
  });

  const [displayText1, setDisplayText1] = useState('');
  const [displayText2, setDisplayText2] = useState('');
  const [showCursor1, setShowCursor1] = useState(true);
  const [showCursor2, setShowCursor2] = useState(false);
  const [, setIsDeleting] = useState(false);

  const text1 = '개장 10분 전';
  const text2 = '모든 분석 완료';

  useEffect(() => {
    let currentIndex1 = 0;
    let currentIndex2 = 0;
    const typingSpeed = 40;
    const deletingSpeed = 25;
    const pauseBeforeDelete = 1000;
    const pauseBeforeRetype = 200;

    const cycle = () => {
      // Type text1
      const typeText1Interval = setInterval(() => {
        if (currentIndex1 <= text1.length) {
          setDisplayText1(text1.substring(0, currentIndex1));
          currentIndex1++;
        } else {
          clearInterval(typeText1Interval);
          setShowCursor1(false);
          setShowCursor2(true);

          // Type text2
          setTimeout(() => {
            const typeText2Interval = setInterval(() => {
              if (currentIndex2 <= text2.length) {
                setDisplayText2(text2.substring(0, currentIndex2));
                currentIndex2++;
              } else {
                clearInterval(typeText2Interval);
                setShowCursor2(false);

                // Pause, then delete
                setTimeout(() => {
                  setIsDeleting(true);

                  // Delete text2
                  const deleteText2Interval = setInterval(() => {
                    if (currentIndex2 > 0) {
                      currentIndex2--;
                      setDisplayText2(text2.substring(0, currentIndex2));
                    } else {
                      clearInterval(deleteText2Interval);
                      setShowCursor2(true);

                      // Delete text1
                      setTimeout(() => {
                        setShowCursor1(true);
                        setShowCursor2(false);
                        const deleteText1Interval = setInterval(() => {
                          if (currentIndex1 > 0) {
                            currentIndex1--;
                            setDisplayText1(text1.substring(0, currentIndex1));
                          } else {
                            clearInterval(deleteText1Interval);
                            setIsDeleting(false);

                            // Start over
                            setTimeout(cycle, pauseBeforeRetype);
                          }
                        }, deletingSpeed);
                      }, 200);
                    }
                  }, deletingSpeed);
                }, pauseBeforeDelete);
              }
            }, typingSpeed);
          }, 200);
        }
      }, typingSpeed);
    };

    const timer = setTimeout(cycle, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section ref={ref} className="py-20 lg:py-24 px-6 lg:px-8 relative">
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="will-change-transform"
          style={{ transform: 'translateZ(0)' }}
        >
          <div className="relative">
            {/* Subtle Glow effect */}
            <div className="absolute inset-0 blur-2xl opacity-5 bg-gradient-to-r from-emerald-500 to-green-400" aria-hidden="true" />

            <h3 className="relative text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light mb-6 lg:mb-8 tracking-tight leading-tight font-mono">
              <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                {displayText1}
                {showCursor1 && (
                  <span className="inline-block w-[3px] h-[0.9em] bg-emerald-400 ml-1 shadow-[0_0_4px_rgba(16,185,129,0.5)] animate-pulse" />
                )}
              </span>
              <br />
              <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-emerald-200 to-green-300 drop-shadow-[0_0_10px_rgba(74,222,128,0.3)]">
                {displayText2}
                {showCursor2 && (
                  <span className="inline-block w-[3px] h-[0.9em] bg-green-300 ml-1 shadow-[0_0_6px_rgba(74,222,128,0.5)] animate-pulse" />
                )}
              </span>
            </h3>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="mb-8"
          >
            <p className="text-sm sm:text-base md:text-lg text-slate-400 font-light tracking-wide">
              5초 구독 • 광고 없음 • 완전 무료
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
          >
            <CTAButton formatted={formatted} ariaLabel="매일 아침 7시 50분 분석 받기" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default CTASection;