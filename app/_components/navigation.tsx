'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    { href: '/', label: '홈' },
    { href: '/about', label: '서비스 소개' },
    { href: '/technical-indicators', label: '기술 지표 가이드' },
    { href: '/faq', label: 'FAQ' },
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
              {navigationLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative"
                >
                  <motion.div
                    className="relative px-4 py-2 text-sm font-light tracking-wide focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl"
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    variants={{
                      rest: {
                        scale: 1,
                      },
                      hover: {
                        scale: 1.05,
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
                        rest: { color: 'rgb(203, 213, 225)' },
                        hover: {
                          color: 'rgb(52, 211, 153)',
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
                      className="absolute inset-0 rounded-3xl bg-emerald-500/5"
                      variants={{
                        rest: {
                          scale: 0,
                          opacity: 0,
                          boxShadow: '0 0 0px rgba(16, 185, 129, 0)',
                        },
                        hover: {
                          scale: 1,
                          opacity: 1,
                          boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
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
              ))}
            </div>

            {/* Desktop Subscribe Button */}
            <div className="hidden md:block">
              <Link href="/subscribe">
                <motion.button
                  className="relative overflow-hidden bg-black/50 border border-emerald-500/30 text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black px-6 py-2.5 rounded-3xl cursor-pointer"
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
                      boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)',
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
                    className="relative z-10 font-medium tracking-wide"
                    variants={{
                      rest: { color: 'rgb(52, 211, 153)' },
                      hover: {
                        color: 'rgb(0, 0, 0)',
                        transition: {
                          duration: 0.3,
                        },
                      },
                    }}
                  >
                    무료 메일받기
                  </motion.span>
                  <motion.span
                    className="absolute inset-0 bg-emerald-600 rounded-3xl"
                    variants={{
                      rest: { scaleX: 0, transformOrigin: 'left' },
                      hover: {
                        scaleX: 1,
                        transition: {
                          duration: 0.3,
                          ease: [0.19, 1, 0.22, 1],
                        },
                      },
                    }}
                    aria-hidden="true"
                  />
                </motion.button>
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
        className={`fixed top-0 left-0 w-full h-screen bg-slate-900/95 backdrop-blur-xl border-b border-emerald-500/20 z-40 md:hidden transition-transform duration-700 ease-out-expo ${
          isMobileMenuOpen ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex flex-col h-full pt-24 px-6 pb-6">
          {/* Mobile Navigation Links */}
          <nav className="flex flex-col gap-2">
            {navigationLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="group relative px-6 py-4 text-lg font-light tracking-wide text-slate-300 hover:text-emerald-400 transition-colors duration-700 ease-out-expo focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded-3xl"
              >
                <span className="relative z-10">{link.label}</span>
                <span
                  className="absolute inset-0 rounded-3xl bg-emerald-500/5 scale-0 group-hover:scale-100 transition-transform duration-700 ease-out-expo"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </nav>

          {/* Mobile Subscribe Button */}
          <div className="mt-auto pt-6 border-t border-emerald-500/20">
            <Link href="/subscribe" onClick={() => setIsMobileMenuOpen(false)}>
              <Button
                variant="outline"
                className="w-full relative group overflow-hidden bg-black/50 border-emerald-500/30 text-emerald-400 hover:text-black hover:border-emerald-400 transition-all duration-700 ease-out-expo focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 px-6 py-4 rounded-3xl cursor-pointer text-lg"
              >
                <span className="relative z-10 font-medium tracking-wide">
                  무료 메일받기
                </span>
                <span
                  className="absolute inset-0 bg-emerald-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-out-expo origin-left"
                  aria-hidden="true"
                />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default Navigation;