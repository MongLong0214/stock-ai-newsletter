import Link from 'next/link';
import { motion } from 'framer-motion';
import { ANIMATION_DURATION, EASING } from './_constants';
import type { NavigationLink } from './_types';

interface NavLinkProps {
  link: NavigationLink;
  index: number;
  isActive: boolean;
}

function NavLink({ link, index, isActive }: NavLinkProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: ANIMATION_DURATION.link,
        delay: index * 0.1,
        ease: EASING.expo,
      }}
    >
      <Link href={link.href} className="group relative block">
        <motion.div
          className="relative px-4 py-2 rounded-xl overflow-hidden"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.2, ease: EASING.expo }}
        >
          {/* 배경 레이어 */}
          <motion.div
            className="absolute inset-0 rounded-xl bg-slate-900/40"
            initial={{ opacity: 0 }}
            whileHover={{
              opacity: 1,
              transition: { duration: 0.2 },
            }}
          />

          {/* 활성 상태 배경 */}
          {isActive && (
            <motion.div
              layoutId="activeNav"
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/20 via-emerald-600/15 to-emerald-700/10 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}

          {/* 호버 글로우 효과 */}
          <motion.div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.15) 0%, transparent 70%)',
            }}
          />

          {/* 호버 시 테두리 */}
          <motion.div
            className="absolute inset-0 rounded-xl border border-transparent group-hover:border-emerald-500/20 transition-colors duration-300"
          />

          {/* 콘텐츠 */}
          <div className="relative flex items-center gap-2">
            <span
              className={`text-sm font-medium tracking-wide transition-all duration-300 ${
                isActive
                  ? 'text-white drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                  : link.highlighted
                  ? 'text-emerald-400 group-hover:text-emerald-300'
                  : 'text-slate-300 group-hover:text-white'
              }`}
            >
              {link.label}
            </span>
            {link.highlighted && !isActive && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.5, delay: 0.3 }}
                className="ml-1 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/15 rounded border border-emerald-500/40"
              >
                NEW
              </motion.span>
            )}
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

export default NavLink;