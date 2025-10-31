import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { EASING, NAVIGATION_LINKS } from './_constants';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - 완전 불투명 */}
      <div
        className="fixed inset-0 bg-black z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Menu Panel - 최고 성능 슬라이드 */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{
          type: 'tween',
          duration: 0.25,
          ease: [0.32, 0.72, 0, 1], // iOS native ease
        }}
        className="fixed top-0 right-0 bottom-0 w-[85%] max-w-sm bg-black border-l border-emerald-500/20 z-50 lg:hidden overflow-hidden"
        style={{
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
          WebkitBackfaceVisibility: 'hidden',
          WebkitTransform: 'translate3d(0, 0, 0)',
        }}
      >
        {/* Subtle decorative elements */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-emerald-600/5 rounded-full blur-3xl" />

        {/* Scrollable content */}
        <div className="relative h-full overflow-y-auto">
          <div className="relative flex flex-col h-full p-6">
          {/* Header - 정적 렌더링 */}
          <div className="flex items-center justify-between mb-8 pt-12">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-emerald-400"
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
              <div className="flex flex-col">
                <span className="text-lg font-bold text-emerald-400">
                  Stock Matrix
                </span>
                <span className="text-[10px] text-emerald-500/60 tracking-widest">
                  AI ANALYSIS
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Links - 진입 시만 애니메이션 */}
          <nav className="flex flex-col gap-2 mb-8">
            {NAVIGATION_LINKS.map((link, index) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + '/');

              return (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.05,
                    duration: 0.2,
                    ease: 'easeOut',
                  }}
                  style={{ willChange: 'auto' }}
                >
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className="group relative block"
                  >
                    <div className="relative px-4 py-3 rounded-xl overflow-hidden">
                      {isActive && (
                        <motion.div
                          layoutId="activeMobileNav"
                          className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl"
                          transition={EASING.spring}
                          style={{ willChange: 'auto' }}
                        />
                      )}

                      <div className="relative flex items-center gap-3">
                        <span
                          className={`text-base font-medium tracking-wide transition-colors duration-300 ${
                            isActive
                              ? 'text-white'
                              : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        >
                          {link.label}
                        </span>
                        {link.highlighted && !isActive && (
                          <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 rounded border border-emerald-500/30">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          {/* Mobile Subscribe Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.3,
              duration: 0.2,
              ease: 'easeOut',
            }}
            style={{ willChange: 'auto' }}
            className="mt-auto"
          >
            <Link href="/subscribe" onClick={onClose}>
              <motion.div
                className="group relative px-6 py-4 rounded-xl overflow-hidden border border-emerald-500/30 bg-emerald-500/10"
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 rounded-xl opacity-0 group-active:opacity-100 transition-opacity duration-300" />

                {/* Text */}
                <div className="relative flex items-center justify-center">
                  <span className="text-base font-semibold text-emerald-400">
                    무료 메일받기
                  </span>
                </div>
              </motion.div>
            </Link>

            <p className="mt-4 text-xs text-center text-slate-500">
              매일 오전 7:50 • 광고 없음 • 완전 무료
            </p>
          </motion.div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

export default MobileMenu;