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
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 rounded-xl bg-emerald-500/5"
            initial={{ opacity: 0, scale: 0.8 }}
            whileHover={{
              opacity: 1,
              scale: 1,
              transition: { duration: ANIMATION_DURATION.hover },
            }}
          />

          {isActive && (
            <motion.div
              layoutId="activeNav"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/15 to-emerald-600/10 border border-emerald-500/20"
              transition={EASING.spring}
            />
          )}

          <motion.div
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background:
                'radial-gradient(circle at center, rgba(16,185,129,0.1) 0%, transparent 70%)',
            }}
          />

          <div className="relative flex items-center gap-2">
            <span
              className={`text-sm font-medium tracking-wide transition-colors duration-300 ${
                isActive
                  ? 'text-white'
                  : link.highlighted
                  ? 'text-emerald-400 group-hover:text-emerald-300'
                  : 'text-slate-300 group-hover:text-white'
              }`}
            >
              {link.label}
            </span>
            {link.highlighted && !isActive && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-1 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400 bg-emerald-500/10 rounded border border-emerald-500/30"
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