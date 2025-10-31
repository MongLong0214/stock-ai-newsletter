import Link from 'next/link';
import { motion } from 'framer-motion';

function SubscribeButton() {
  return (
    <Link href="/subscribe">
      <motion.div
        className="group relative px-6 py-2.5 rounded-lg overflow-hidden border border-emerald-500/30 bg-emerald-500/10"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2 }}
      >
        {/* Hover glow effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 rounded-lg opacity-0 group-hover:opacity-100"
          transition={{ duration: 0.3 }}
        />

        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />

        {/* Text */}
        <span className="relative z-10 text-sm font-semibold text-emerald-400 group-hover:text-emerald-300 transition-colors duration-300">
          무료 메일받기
        </span>
      </motion.div>
    </Link>
  );
}

export default SubscribeButton;