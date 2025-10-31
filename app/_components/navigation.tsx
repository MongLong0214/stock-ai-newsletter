'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Body scroll lock when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const navigationLinks = [
    { href: '/', label: '홈', highlighted: false },
    { href: '/archive', label: '아카이브', highlighted: true },
    { href: '/about', label: '서비스 소개', highlighted: false },
    { href: '/technical-indicators', label: '기술 지표 가이드', highlighted: false },
    { href: '/faq', label: 'FAQ', highlighted: false },
  ];

  return (
    <>
      <nav className="fixed top-0 w-full z-50 glass-morphism-strong">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <Link
              href="/"
              className="group relative text-xl font-medium tracking-tight text-emerald-400 hover:text-emerald-300 transition-colors duration-700 ease-out-expo focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl px-3 py-2 -mx-3 -my-2"
            >
              <span className="relative z-10">Stock Matrix</span>
              <span
                className="absolute inset-0 rounded-3xl bg-emerald-500/5 scale-0 group-hover:scale-100 transition-transform duration-700 ease-out-expo"
                aria-hidden="true"
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              {navigationLinks.map((link) => {
                const isActive = link.href === '/'
                  ? pathname === '/'
                  : pathname === link.href || pathname.startsWith(link.href + '/');

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative"
                  >
                    <motion.div
                      className={`relative px-4 py-2 text-sm tracking-wide focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl ${
                        isActive
                          ? 'font-semibold'
                          : link.highlighted
                          ? 'font-bold'
                          : 'font-light'
                      }`}
                      initial="rest"
                      whileHover="hover"
                      whileTap="tap"
                      variants={{
                        rest: {
                          scale: 1,
                          boxShadow: '0 0 0px rgba(16, 185, 129, 0)',
                        },
                        hover: {
                          scale: 1.05,
                          boxShadow: link.highlighted ? '0 0 25px rgba(16, 185, 129, 0.35)' : '0 0 20px rgba(16, 185, 129, 0.2)',
                          transition: {
                            duration: 0.3,
                            ease: [0.19, 1, 0.22, 1],
                          },
                        },
                        tap: {
                          scale: 0.98,
                          transition: {
                            duration: 0.1,
                          },
                        },
                      }}
                    >
                      <motion.span
                        className="relative z-10"
                        variants={{
                          rest: {
                            color: isActive
                              ? 'rgb(255, 255, 255)'
                              : link.highlighted
                              ? 'rgb(52, 211, 153)'
                              : 'rgb(203, 213, 225)'
                          },
                          hover: {
                            color: 'rgb(167, 243, 208)',
                            transition: {
                              duration: 0.3,
                              ease: [0.19, 1, 0.22, 1],
                            },
                          },
                        }}
                      >
                        {link.label}
                      </motion.span>
                      <motion.span
                        className={`absolute inset-0 rounded-3xl ${
                          isActive ? 'bg-emerald-500/20' : 'bg-emerald-500/5'
                        }`}
                        initial={{
                          scale: isActive ? 1 : 0,
                          opacity: isActive ? 1 : 0,
                        }}
                        animate={{
                          scale: isActive ? 1 : 0,
                          opacity: isActive ? 1 : 0,
                        }}
                        whileHover={{
                          scale: 1,
                          opacity: 1,
                          boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
                          transition: {
                            duration: 0.3,
                            ease: [0.19, 1, 0.22, 1],
                          },
                        }}
                        transition={{
                          duration: 0.3,
                          ease: [0.19, 1, 0.22, 1],
                        }}
                        aria-hidden="true"
                      />
                      {isActive && (
                        <motion.span
                          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400"
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                          aria-hidden="true"
                        />
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop Subscribe Button */}
            <div className="hidden md:block">
              <Link href="/subscribe">
                <motion.div
                  className="relative px-5 py-2 text-sm font-medium tracking-wide focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl border border-emerald-500/40 bg-emerald-500/10"
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                  variants={{
                    rest: {
                      scale: 1,
                      boxShadow: '0 0 0px rgba(16, 185, 129, 0)',
                    },
                    hover: {
                      scale: 1.05,
                      boxShadow: '0 0 30px rgba(16, 185, 129, 0.3)',
                      transition: {
                        duration: 0.3,
                        ease: [0.19, 1, 0.22, 1],
                      },
                    },
                    tap: {
                      scale: 0.98,
                      boxShadow: '0 0 15px rgba(16, 185, 129, 0.2)',
                      transition: {
                        duration: 0.1,
                      },
                    },
                  }}
                >
                  <motion.span
                    className="relative z-10"
                    variants={{
                      rest: { color: 'rgb(52, 211, 153)' },
                      hover: {
                        color: 'rgb(167, 243, 208)',
                        transition: {
                          duration: 0.3,
                          ease: [0.19, 1, 0.22, 1],
                        },
                      },
                    }}
                  >
                    무료 메일받기
                  </motion.span>
                  <motion.span
                    className="absolute inset-0 rounded-3xl bg-emerald-500/20"
                    variants={{
                      rest: {
                        opacity: 0,
                      },
                      hover: {
                        opacity: 1,
                        transition: {
                          duration: 0.3,
                          ease: [0.19, 1, 0.22, 1],
                        },
                      },
                    }}
                    aria-hidden="true"
                  />
                </motion.div>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-emerald-400 hover:text-emerald-300 transition-colors duration-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              <div className="w-6 h-5 relative flex flex-col justify-between">
                <span
                  className={`block h-0.5 w-full bg-current transition-all duration-700 ease-out-expo ${
                    isMobileMenuOpen ? 'absolute top-1/2 -translate-y-1/2 rotate-45' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 w-full bg-current transition-all duration-700 ease-out-expo ${
                    isMobileMenuOpen ? 'opacity-0' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 w-full bg-current transition-all duration-700 ease-out-expo ${
                    isMobileMenuOpen ? 'absolute top-1/2 -translate-y-1/2 -rotate-45' : ''
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden transition-opacity duration-700 ease-out-expo ${
          isMobileMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Menu Panel */}
      <div
        className={`fixed top-0 left-0 w-full h-screen bg-gradient-to-b from-slate-950/98 to-slate-900/98 backdrop-blur-2xl z-40 md:hidden transition-transform duration-700 ease-out-expo ${
          isMobileMenuOpen ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex flex-col h-full pt-24 px-6 pb-8">
          {/* Mobile Navigation Links */}
          <nav className="flex flex-col gap-2">
            {navigationLinks.map((link) => {
              const isActive = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`group relative px-5 py-3.5 text-base tracking-wide transition-all duration-500 ease-out-expo focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-xl ${
                    isActive
                      ? 'font-semibold text-white'
                      : link.highlighted
                      ? 'font-bold text-emerald-400'
                      : 'font-light text-slate-400'
                  }`}
                >
                  <span className="relative z-10 flex items-center justify-between">
                    <span className="flex items-center gap-3">
                      {link.label}
                      {link.highlighted && !isActive && (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                          NEW
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    )}
                  </span>
                  <span
                    className={`absolute inset-0 rounded-xl transition-all duration-500 ease-out-expo ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 scale-100 border border-emerald-500/20'
                        : 'bg-slate-800/30 scale-0 group-hover:scale-100 border border-transparent group-hover:border-slate-700/50'
                    }`}
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}

export default Navigation;