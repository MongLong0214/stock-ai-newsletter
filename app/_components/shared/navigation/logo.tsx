import Link from 'next/link';
import { motion } from 'framer-motion';
import { EASING } from './_constants';

function Logo() {
  return (
    <Link href="/" className="group relative flex items-center gap-3">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.5, ease: EASING.expo }}
        className="relative"
      >
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center backdrop-blur-xl shadow-[0_0_20px_rgba(16,185,129,0.15)]">
          <svg
            className="w-5 h-5 text-emerald-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 17 7 13 11 15 17 9 21 4" />
            <circle cx="21" cy="4" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-emerald-500/0 to-emerald-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </motion.div>

      <div className="flex flex-col">
        <motion.span
          className="text-base sm:text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-400 bg-size-200 animate-gradient"
          whileHover={{ scale: 1.02 }}
        >
          Stock Matrix
        </motion.span>
        <span className="text-[9px] sm:text-[10px] text-emerald-500/60 font-light tracking-widest uppercase">
          AI Analysis
        </span>
      </div>
    </Link>
  );
}

export default Logo;