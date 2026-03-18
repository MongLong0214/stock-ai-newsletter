'use client';

import AnimatedBackground from '@/components/animated-background';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState, useCallback } from 'react';

const GLITCH_CHARS = '!@#$%^&*()_+-=[]{}|;:<>?/~`0123456789ABCDEF';

function useGlitchText(original: string, interval = 3000, duration = 150) {
  const [text, setText] = useState(original);

  useEffect(() => {
    const glitch = () => {
      const garbled = original
        .split('')
        .map((ch) =>
          Math.random() < 0.6
            ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
            : ch,
        )
        .join('');
      setText(garbled);
      setTimeout(() => {
        // 두 번째 깨짐
        const garbled2 = original
          .split('')
          .map((ch) =>
            Math.random() < 0.3
              ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
              : ch,
          )
          .join('');
        setText(garbled2);
        setTimeout(() => setText(original), duration / 2);
      }, duration);
    };

    const id = setInterval(glitch, interval + Math.random() * 500);
    return () => clearInterval(id);
  }, [original, interval, duration]);

  return text;
}

export default function NotFound() {
  const [displayedText, setDisplayedText] = useState('');
  const [pathname, setPathname] = useState('/unknown');
  const fullText = '이 페이지는 매트릭스에 존재하지 않습니다';
  const glitched404 = useGlitchText('404', 800, 80);

  // 랜덤 글리치 슬라이스 생성
  const [sliceStyle, setSliceStyle] = useState<React.CSSProperties>({});
  const triggerSlice = useCallback(() => {
    const top = Math.random() * 80;
    const height = 5 + Math.random() * 15;
    const offset = (Math.random() - 0.5) * 40;
    setSliceStyle({
      clipPath: `inset(${top}% 0 ${100 - top - height}% 0)`,
      transform: `translateX(${offset}px)`,
      opacity: 1,
    });
    setTimeout(() => {
      const offset2 = (Math.random() - 0.5) * 20;
      setSliceStyle({
        clipPath: `inset(${top + 2}% 0 ${100 - top - height + 4}% 0)`,
        transform: `translateX(${offset2}px) skewX(${(Math.random() - 0.5) * 10}deg)`,
        opacity: 1,
      });
      setTimeout(() => setSliceStyle({ opacity: 0 }), 80);
    }, 60);
  }, []);

  useEffect(() => {
    const id = setInterval(triggerSlice, 600 + Math.random() * 800);
    triggerSlice(); // 초기 1회
    return () => clearInterval(id);
  }, [triggerSlice]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < fullText.length) {
        setDisplayedText(fullText.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setPathname(window.location.pathname);
    document.title = '페이지를 찾을 수 없습니다 | StockMatrix';
  }, []);

  return (
    <>
      <AnimatedBackground />

      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-[5] bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.05)_50%)] bg-[length:100%_4px] opacity-30" />

      {/* 글리치 플래시 (간헐적 화면 번쩍임) */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[6] bg-emerald-500/5"
        animate={{ opacity: [0, 0, 0.15, 0, 0.1, 0, 0.2, 0] }}
        transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 1.5, ease: 'linear' }}
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* 404 글리치 */}
          <div className="relative mb-8 select-none">
            {/* 메인 텍스트 */}
            <motion.h1
              animate={{
                x: [0, -3, 4, -1, 0],
                y: [0, 1, -1, 0],
              }}
              transition={{
                duration: 0.15,
                repeat: Infinity,
                repeatDelay: 1,
                ease: 'easeInOut',
              }}
              className="glitch-main font-mono text-[140px] font-bold leading-none tracking-tighter text-emerald-500 sm:text-[200px] md:text-[240px]"
            >
              {glitched404}
            </motion.h1>

            {/* Red 채널 (chromatic aberration) */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              animate={{
                x: [-3, -5, -2, -4, -3],
                y: [0, 1, -1, 2, 0],
                opacity: [0.4, 0.6, 0.3, 0.5, 0.4],
              }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            >
              <div className="font-mono text-[140px] font-bold leading-none tracking-tighter text-red-500 mix-blend-multiply sm:text-[200px] md:text-[240px]">
                {glitched404}
              </div>
            </motion.div>

            {/* Cyan 채널 (chromatic aberration) */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              animate={{
                x: [3, 5, 2, 4, 3],
                y: [0, -1, 1, -2, 0],
                opacity: [0.4, 0.3, 0.6, 0.5, 0.4],
              }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            >
              <div className="font-mono text-[140px] font-bold leading-none tracking-tighter text-cyan-500 mix-blend-screen sm:text-[200px] md:text-[240px]">
                {glitched404}
              </div>
            </motion.div>

            {/* 수평 슬라이스 글리치 레이어 */}
            <div
              className="pointer-events-none absolute inset-0 transition-none"
              aria-hidden="true"
              style={sliceStyle}
            >
              <div className="font-mono text-[140px] font-bold leading-none tracking-tighter text-emerald-400 sm:text-[200px] md:text-[240px]">
                404
              </div>
            </div>
          </div>

          {/* 타이핑 메시지 */}
          <div className="mb-6 min-h-[80px] sm:min-h-[60px]">
            <p className="font-mono text-lg text-emerald-400 sm:text-xl md:text-2xl">
              <span className="text-emerald-600">{'>'} </span>
              {displayedText}
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              >
                _
              </motion.span>
            </p>
          </div>

          {/* 시스템 에러 패널 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mx-auto mb-10 max-w-md rounded-md border border-emerald-900/50 bg-black/50 p-5 font-mono text-sm text-emerald-500/80 backdrop-blur-sm"
          >
            <p className="mb-2 text-emerald-400">
              <span className="text-emerald-600">ERROR:</span> RESOURCE_NOT_FOUND
            </p>
            <p className="mb-1 text-emerald-500/60">
              Status Code: <span className="text-emerald-400">404</span>
            </p>
            <p className="mb-3 text-emerald-500/60">
              Location: <span className="text-emerald-400">{pathname}</span>
            </p>
            <p className="border-t border-emerald-900/50 pt-3 text-xs text-emerald-600">
              TIP: 메인 페이지로 돌아가 다시 시도하세요
            </p>
          </motion.div>

          {/* 터미널 버튼 */}
          <Link href="/">
            <motion.button
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              className="group relative cursor-pointer overflow-hidden rounded-md border border-emerald-500/50 bg-black/60 px-8 py-4 font-mono text-base text-emerald-500 backdrop-blur-sm transition-all hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] sm:text-lg"
            >
              <span className="relative z-10">
                <span className="text-emerald-600">$</span> cd ~/home
              </span>
            </motion.button>
          </Link>

          {/* 바이너리 장식 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 font-mono text-xs text-emerald-950/50 sm:text-sm"
          >
            01100101 01110010 01110010 01101111 01110010
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}