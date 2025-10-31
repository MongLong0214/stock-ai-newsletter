'use client';

import { motion } from "framer-motion";
import Link from "next/link";

interface CTAButtonProps {
  formatted: string;
  ariaLabel?: string;
  className?: string;
}

function CTAButton({ formatted, ariaLabel = "무료 메일 받기", className = "" }: CTAButtonProps) {
  return (
    <Link href="/subscribe">
      <motion.button
        className={`relative overflow-hidden bg-emerald-600 text-slate-50 text-base font-medium px-8 py-3.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer border-0 ${className}`}
        aria-label={ariaLabel}
        initial="rest"
        whileHover="hover"
        whileTap="tap"
        variants={{
          rest: {
            scale: 1,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          },
          hover: {
            scale: 1.02,
            boxShadow: '0 15px 40px rgba(16, 185, 129, 0.25), 0 0 20px rgba(16, 185, 129, 0.15)',
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

        {/* Continuous Flowing Gradient - Always Active */}
        <motion.span
          className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 rounded-xl"
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            opacity: [0.5, 0.7, 0.5],
          }}
          transition={{
            duration: 3,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
          style={{
            backgroundSize: '200% 100%',
          }}
          aria-hidden="true"
        />

        {/* Subtle Pulse Glow - Always Active */}
        <motion.span
          className="absolute inset-0 rounded-xl"
          animate={{
            boxShadow: [
              '0 0 20px rgba(16, 185, 129, 0.3)',
              '0 0 30px rgba(16, 185, 129, 0.5)',
              '0 0 20px rgba(16, 185, 129, 0.3)',
            ],
          }}
          transition={{
            duration: 2,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
          aria-hidden="true"
        />

        {/* Hover Gradient Overlay */}
        <motion.span
          className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 rounded-xl"
          variants={{
            rest: { opacity: 0 },
            hover: {
              opacity: 0.4,
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
          className="absolute inset-0 rounded-xl"
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
  );
}

export default CTAButton;