import Link from 'next/link';
import { motion } from 'framer-motion';

function SubscribeButton() {
  return (
    <Link href="/subscribe">
      <motion.div
        className="group relative px-6 py-2.5 rounded-lg overflow-hidden border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 shadow-lg shadow-emerald-500/10"
        whileHover={{ scale: 1.03, boxShadow: '0 20px 40px rgba(16,185,129,0.2)' }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* 배경 글로우 */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/25 to-emerald-400/20 rounded-lg opacity-0 group-hover:opacity-100"
          transition={{ duration: 0.3 }}
        />

        {/* 상단 하이라이트 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

        {/* 좌측 글로우 */}
        <motion.div
          className="absolute -left-12 top-1/2 -translate-y-1/2 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100"
          transition={{ duration: 0.5 }}
        />

        {/* 우측 글로우 */}
        <motion.div
          className="absolute -right-12 top-1/2 -translate-y-1/2 w-24 h-24 bg-emerald-400/20 rounded-full blur-2xl opacity-0 group-hover:opacity-100"
          transition={{ duration: 0.5, delay: 0.1 }}
        />

        {/* Shimmer 효과 */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%', opacity: 0 }}
          whileHover={{ x: '100%', opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        />

        {/* 텍스트 */}
        <span className="relative z-10 text-sm font-semibold text-emerald-400 group-hover:text-emerald-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.4)] group-hover:drop-shadow-[0_2px_12px_rgba(16,185,129,0.6)] transition-all duration-300">
          무료 메일받기
        </span>
      </motion.div>
    </Link>
  );
}

export default SubscribeButton;