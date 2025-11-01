'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './navigation/logo';
import NavLink from './navigation/nav-link';
import SubscribeButton from './navigation/subscribe-button';
import MobileMenu from './navigation/mobile-menu';
import {
  SCROLL_THRESHOLD,
  ANIMATION_DURATION,
  EASING,
  NAVIGATION_LINKS,
} from './navigation/_constants';

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > SCROLL_THRESHOLD);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileMenuOpen, closeMobileMenu]);

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{
          duration: 0.4,
          ease: [0.19, 1, 0.22, 1],
        }}
        style={{
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          perspective: 1000,
        }}
        className={`fixed top-0 w-full z-50 overflow-hidden transition-[background-color,box-shadow] duration-700 ${
          scrolled
            ? 'bg-black/95 border-b border-emerald-500/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
            : 'bg-black/80 border-b border-transparent'
        }`}
      >
        {/* Animated background - performance optimized */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
          <div className="absolute inset-0" style={{ willChange: 'auto' }}>
            {[...Array(8)].map((_, i) => (
              <div
                key={`rain-${i}`}
                className="absolute top-0 w-px bg-gradient-to-b from-emerald-500/0 via-emerald-400/30 to-emerald-500/0"
                style={{
                  left: `${i * 12 + 4}%`,
                  height: '100px',
                  animation: `matrix-fall ${4 + (i % 2)}s linear infinite`,
                  animationDelay: `${i * 0.4}s`,
                  willChange: 'auto',
                }}
              />
            ))}
          </div>

          <div className="absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/5 rounded-full"
              style={{
                animation: 'pulse-glow 6s ease-in-out infinite',
                willChange: 'auto',
              }}
            />
          </div>
        </div>

        {/* Border gradient */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

        {/* Scanline effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.02)_50%)] bg-[length:100%_2px] animate-[matrix-scan_3s_linear_infinite]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-18">
            <Logo />

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1">
              {NAVIGATION_LINKS.map((link, index) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname === link.href ||
                      pathname.startsWith(link.href + '/');

                return (
                  <NavLink
                    key={link.href}
                    link={link}
                    index={index}
                    isActive={isActive}
                  />
                );
              })}
            </div>

            {/* Desktop Subscribe Button */}
            <motion.div
              className="hidden lg:block"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: ANIMATION_DURATION.link, delay: 0.5 }}
            >
              <SubscribeButton />
            </motion.div>

            {/* Mobile Menu Button */}
            <motion.button
              onClick={toggleMobileMenu}
              aria-expanded={isMobileMenuOpen}
              aria-label="Toggle mobile navigation menu"
              aria-controls="mobile-menu"
              className="lg:hidden relative p-2 text-emerald-400 hover:text-emerald-300 transition-colors duration-300 focus:outline-none focus:ring-offset-black rounded-lg"
              whileTap={{ scale: 0.9 }}
            >
              <div className="w-6 h-5 relative flex flex-col justify-between">
                <motion.span
                  className="block h-0.5 w-full bg-current rounded-full"
                  animate={
                    isMobileMenuOpen
                      ? {
                          rotate: 45,
                          y: 9,
                          transition: {
                            duration: ANIMATION_DURATION.mobile,
                            ease: EASING.expo,
                          },
                        }
                      : {
                          rotate: 0,
                          y: 0,
                          transition: {
                            duration: ANIMATION_DURATION.mobile,
                            ease: EASING.expo,
                          },
                        }
                  }
                />
                <motion.span
                  className="block h-0.5 w-full bg-current rounded-full"
                  animate={
                    isMobileMenuOpen
                      ? {
                          opacity: 0,
                          transition: { duration: 0.2 },
                        }
                      : {
                          opacity: 1,
                          transition: { duration: 0.2, delay: 0.1 },
                        }
                  }
                />
                <motion.span
                  className="block h-0.5 w-full bg-current rounded-full"
                  animate={
                    isMobileMenuOpen
                      ? {
                          rotate: -45,
                          y: -9,
                          transition: {
                            duration: ANIMATION_DURATION.mobile,
                            ease: EASING.expo,
                          },
                        }
                      : {
                          rotate: 0,
                          y: 0,
                          transition: {
                            duration: ANIMATION_DURATION.mobile,
                            ease: EASING.expo,
                          },
                        }
                  }
                />
              </div>
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <MobileMenu isOpen={isMobileMenuOpen} onClose={closeMobileMenu} />
        )}
      </AnimatePresence>
    </>
  );
}

export default Navigation;