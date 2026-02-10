'use client';

import AnimatedBackground from '@/components/animated-background';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const [displayedText, setDisplayedText] = useState('');
  const [pathname, setPathname] = useState('/unknown');
  const fullText = '이 페이지는 매트릭스에 존재하지 않습니다';

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
  }, []);

  return (
    <>
      <AnimatedBackground />

      {/* Scanline overlay for CRT aesthetic */}
      <div className="pointer-events-none fixed inset-0 z-[5] bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.05)_50%)] bg-[length:100%_4px] opacity-30" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {/* 404 with subtle glitch effect */}
          <div className="relative mb-8">
            <motion.h1
              animate={{
                x: [0, -2, 2, 0],
                opacity: [1, 0.9, 1],
              }}
              transition={{
                duration: 0.2,
                repeat: Infinity,
                repeatDelay: 4,
                ease: 'easeInOut',
              }}
              className="font-mono text-[140px] font-bold leading-none tracking-tighter text-emerald-500 sm:text-[200px] md:text-[240px]"
            >
              404
            </motion.h1>

            {/* Chromatic aberration effect (red/blue shift) */}
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <h1
                className="font-mono text-[140px] font-bold leading-none tracking-tighter text-red-500/30 sm:text-[200px] md:text-[240px]"
                style={{ transform: 'translate(-2px, 0)' }}
                aria-hidden="true"
              >
                404
              </h1>
            </div>
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <h1
                className="font-mono text-[140px] font-bold leading-none tracking-tighter text-cyan-500/30 sm:text-[200px] md:text-[240px]"
                style={{ transform: 'translate(2px, 0)' }}
                aria-hidden="true"
              >
                404
              </h1>
            </div>
          </div>

          {/* Terminal-style typing message */}
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

          {/* System error panel */}
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

          {/* Terminal command button */}
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

          {/* Binary decoration */}
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
