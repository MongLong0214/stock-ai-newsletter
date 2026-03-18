'use client';

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import CTAButton from "./cta-button";

// ─── Animation Config ───────────────────────────────────────────
const LINE_1 = '개장 30분 전';
const LINE_2 = '모든 분석 완료';

const TYPING_MS = 40;
const DELETING_MS = 25;
const PAUSE_COMPLETE_MS = 1000;
const PAUSE_TRANSITION_MS = 200;
const INITIAL_DELAY_MS = 500;

// ─── Timeline Frame ─────────────────────────────────────────────
interface Frame {
  text1: string;
  text2: string;
  cursor1: boolean;
  cursor2: boolean;
  delay: number;
}

function buildTimeline(): Frame[] {
  const frames: Frame[] = [];

  // Phase 1: Type line 1 (char by char)
  for (let i = 0; i <= LINE_1.length; i++) {
    frames.push({ text1: LINE_1.slice(0, i), text2: '', cursor1: true, cursor2: false, delay: TYPING_MS });
  }

  // Transition: move cursor to line 2
  frames.push({ text1: LINE_1, text2: '', cursor1: false, cursor2: true, delay: PAUSE_TRANSITION_MS });

  // Phase 2: Type line 2 (start from 1 — empty text2 already shown above)
  for (let i = 1; i <= LINE_2.length; i++) {
    frames.push({ text1: LINE_1, text2: LINE_2.slice(0, i), cursor1: false, cursor2: true, delay: TYPING_MS });
  }

  // Hold: show both lines complete
  frames.push({ text1: LINE_1, text2: LINE_2, cursor1: false, cursor2: false, delay: PAUSE_COMPLETE_MS });

  // Phase 3: Delete line 2 (start from length-1 — full text2 already shown above)
  for (let i = LINE_2.length - 1; i >= 0; i--) {
    frames.push({ text1: LINE_1, text2: LINE_2.slice(0, i), cursor1: false, cursor2: true, delay: DELETING_MS });
  }

  // Transition: move cursor to line 1
  frames.push({ text1: LINE_1, text2: '', cursor1: true, cursor2: false, delay: PAUSE_TRANSITION_MS });

  // Phase 4: Delete line 1 (start from length-1 — full text1 already shown above)
  for (let i = LINE_1.length - 1; i >= 0; i--) {
    frames.push({ text1: LINE_1.slice(0, i), text2: '', cursor1: true, cursor2: false, delay: DELETING_MS });
  }

  // Hold: empty before restart
  frames.push({ text1: '', text2: '', cursor1: true, cursor2: false, delay: PAUSE_TRANSITION_MS });

  return frames;
}

// ─── Hook ───────────────────────────────────────────────────────
function useTypewriter(active: boolean) {
  const timeline = useMemo(buildTimeline, []);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!active) return;

    const delay = index === 0 ? INITIAL_DELAY_MS : timeline[index].delay;

    timerRef.current = setTimeout(() => {
      setIndex((prev) => (prev + 1) % timeline.length);
    }, delay);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, index, timeline]);

  return timeline[index];
}

// ─── Cursor ─────────────────────────────────────────────────────
function TypewriterCursor({ color }: { color: 'emerald' | 'green' }) {
  const styles = {
    emerald: 'bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]',
    green: 'bg-green-300 shadow-[0_0_6px_rgba(74,222,128,0.5)]',
  };

  return (
    <span className={`inline-block w-[3px] h-[0.9em] ml-1 animate-pulse ${styles[color]}`} />
  );
}

// ─── Component ──────────────────────────────────────────────────
interface CTASectionProps {
  formatted: string;
}

function CTASection({ formatted }: CTASectionProps) {
  const { ref, isInView } = useReveal<HTMLElement>({
    once: true,
    amount: 0.3,
  });

  const { text1, text2, cursor1, cursor2 } = useTypewriter(isInView);

  return (
    <section ref={ref} className="py-20 lg:py-24 px-6 lg:px-8 relative">
      <div className="max-w-5xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
          className="will-change-transform"
        >
          <div className="relative">
            <div className="absolute inset-0 blur-2xl opacity-5 bg-gradient-to-r from-emerald-500 to-green-400" aria-hidden="true" />

            <h3 className="relative text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light mb-6 lg:mb-8 tracking-tight leading-tight font-mono">
              <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                {text1}
                {cursor1 && <TypewriterCursor color="emerald" />}
              </span>
              <br />
              <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-emerald-200 to-green-300 drop-shadow-[0_0_10px_rgba(74,222,128,0.3)]">
                {text2}
                {cursor2 && <TypewriterCursor color="green" />}
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
            <CTAButton
              formatted={formatted}
              ariaLabel="매일 아침 7시 30분 분석 받기"
              location="home_bottom_cta"
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default CTASection;
