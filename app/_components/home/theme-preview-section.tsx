'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useReveal } from '@/hooks/use-reveal';
import { cn } from '@/lib/utils';

// ── Static Data ───────────────────────────────────────

const STAGES = [
  { id: 'early', label: '초기', color: '#10B981', x: 75, y: 118 },
  { id: 'growth', label: '성장', color: '#0EA5E9', x: 185, y: 38 },
  { id: 'peak', label: '정점', color: '#F59E0B', x: 290, y: 14 },
  { id: 'decay', label: '쇠퇴', color: '#EF4444', x: 475, y: 142 },
];

const MOCK_THEMES = [
  { name: 'AI 반도체', score: 72, stage: 'growth', change: 12, color: '#0EA5E9' },
  { name: '로봇', score: 85, stage: 'peak', change: 3, color: '#F59E0B' },
  { name: '2차전지', score: 34, stage: 'decay', change: -8, color: '#EF4444' },
];

// Hand-crafted lifecycle bezier: rises from Early, peaks, decays
const CURVE_PATH =
  'M 20 140 C 50 138 90 110 140 65 C 175 35 230 14 290 14 C 350 14 385 55 420 95 C 455 135 500 146 540 144';
const AREA_PATH = `${CURVE_PATH} L 540 155 L 20 155 Z`;

// ── Component ─────────────────────────────────────────

interface ThemePreviewSectionProps {
  isMobile?: boolean;
}

function ThemePreviewSection({ isMobile = false }: ThemePreviewSectionProps) {
  const { ref: headerRef, isInView: headerInView } = useReveal<HTMLDivElement>({
    once: true,
    amount: 0.3,
  });

  const { ref: cardRef, isInView: cardInView } = useReveal<HTMLDivElement>({
    once: true,
    amount: 0.15,
  });

  const { ref: ctaRef, isInView: ctaInView } = useReveal<HTMLDivElement>({
    once: true,
    amount: 0.3,
  });

  return (
    <section className="relative py-16 lg:py-24 px-6 lg:px-8 overflow-hidden">
      {/* Ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.04)_0%,transparent_50%)] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto">
        {/* ── Header ── */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 32 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }}
          className="text-center mb-10 lg:mb-14"
        >
          {/* Apple-style "New" announcement */}
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
            className="inline-block text-[11px] font-semibold tracking-[0.25em] uppercase text-emerald-400/70 mb-5"
          >
            New
          </motion.span>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extralight tracking-tight leading-[1.15] mb-4">
            {'테마 라이프사이클 '}
            <span className="font-semibold bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
              인텔리전스
            </span>
          </h2>

          <p className="text-sm lg:text-base text-slate-500 font-light">
            AI가 투자 테마의 생명주기를 추적하고 분석합니다
          </p>
        </motion.div>

        {/* ── Dashboard Card ── */}
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 48 }}
          animate={cardInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.05, ease: [0.19, 1, 0.22, 1] }}
          className="glass-morphism rounded-2xl lg:rounded-3xl overflow-hidden mb-10 lg:mb-12 will-change-transform"
          style={{ transform: 'translateZ(0)' }}
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 lg:px-7 py-3.5 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-medium text-slate-500 tracking-wider uppercase">
                Theme Lifecycle
              </span>
            </div>
            <span className="text-[10px] text-slate-600 font-mono tabular-nums tracking-wider">
              LIVE
            </span>
          </div>

          {/* SVG Lifecycle Curve */}
          <div className="px-3 lg:px-5 pt-6 lg:pt-8 pb-1">
            <svg
              viewBox="0 0 560 180"
              fill="none"
              className="w-full h-auto"
              role="img"
              aria-label="테마 라이프사이클 곡선: 초기, 성장, 정점, 쇠퇴 단계를 보여주는 시각화"
            >
              <defs>
                {/* Multi-stop gradient following stage colors */}
                <linearGradient id="tli-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="30%" stopColor="#0EA5E9" />
                  <stop offset="55%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#EF4444" />
                </linearGradient>

                {/* Vertical area fill beneath curve */}
                <linearGradient id="tli-fill" x1="280" y1="14" x2="280" y2="155" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10B981" stopOpacity="0.07" />
                  <stop offset="1" stopColor="#10B981" stopOpacity="0" />
                </linearGradient>

                {/* Soft glow for the curve */}
                <filter id="tli-glow">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Horizontal grid lines */}
              {[45, 80, 115].map((y) => (
                <line
                  key={y}
                  x1="20"
                  y1={y}
                  x2="540"
                  y2={y}
                  stroke="white"
                  strokeOpacity="0.025"
                  strokeDasharray="3 8"
                />
              ))}

              {/* Baseline axis */}
              <line x1="20" y1="155" x2="540" y2="155" stroke="white" strokeOpacity="0.04" />

              {/* Area fill under curve */}
              <motion.path
                d={AREA_PATH}
                fill="url(#tli-fill)"
                initial={{ opacity: 0 }}
                animate={cardInView ? { opacity: 1 } : {}}
                transition={{ duration: 1.5, delay: 0.4, ease: [0.19, 1, 0.22, 1] }}
              />

              {/* Glow layer (wider, dimmer copy of stroke) */}
              <motion.path
                d={CURVE_PATH}
                stroke="url(#tli-stroke)"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
                filter="url(#tli-glow)"
                opacity={0.3}
                initial={{ pathLength: 0 }}
                animate={cardInView ? { pathLength: 1 } : {}}
                transition={{ duration: 2, delay: 0.25, ease: [0.19, 1, 0.22, 1] }}
              />

              {/* Main curve stroke */}
              <motion.path
                d={CURVE_PATH}
                stroke="url(#tli-stroke)"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={cardInView ? { pathLength: 1 } : {}}
                transition={{ duration: 2, delay: 0.25, ease: [0.19, 1, 0.22, 1] }}
              />

              {/* Stage markers positioned along the curve */}
              {STAGES.map((stage, i) => (
                <motion.g
                  key={stage.id}
                  initial={{ opacity: 0 }}
                  animate={cardInView ? { opacity: 1 } : {}}
                  transition={{
                    duration: 0.5,
                    delay: 0.9 + i * 0.12,
                    ease: [0.19, 1, 0.22, 1],
                  }}
                >
                  {/* Dashed tick from dot to baseline */}
                  <line
                    x1={stage.x}
                    y1={stage.y + 6}
                    x2={stage.x}
                    y2={155}
                    stroke={stage.color}
                    strokeOpacity="0.1"
                    strokeDasharray="2 3"
                  />
                  {/* Outer ring */}
                  <circle
                    cx={stage.x}
                    cy={stage.y}
                    r="5.5"
                    fill="none"
                    stroke={stage.color}
                    strokeOpacity="0.25"
                  />
                  {/* Inner dot */}
                  <circle
                    cx={stage.x}
                    cy={stage.y}
                    r="2.5"
                    fill={stage.color}
                  />
                  {/* Stage label beneath baseline */}
                  <text
                    x={stage.x}
                    y={172}
                    textAnchor="middle"
                    fill={stage.color}
                    fillOpacity={0.65}
                    fontSize="10"
                    fontWeight="500"
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    {stage.label}
                  </text>
                </motion.g>
              ))}
            </svg>
          </div>

          {/* ── Theme Chips ── */}
          <div className="px-5 lg:px-7 pb-5 lg:pb-6 pt-2">
            <p className="text-[10px] font-medium text-slate-600 uppercase tracking-[0.15em] mb-3">
              Active Themes
            </p>

            <div
              className={cn(
                'grid gap-2',
                isMobile ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'
              )}
            >
              {MOCK_THEMES.map((theme, i) => {
                const stageData = STAGES.find((s) => s.id === theme.stage);

                return (
                  <motion.div
                    key={theme.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={cardInView ? { opacity: 1, y: 0 } : {}}
                    transition={{
                      duration: 0.5,
                      delay: 1.3 + i * 0.08,
                      ease: [0.19, 1, 0.22, 1],
                    }}
                    className={cn(
                      'group relative flex items-center justify-between',
                      'px-3.5 py-2.5 rounded-lg',
                      'bg-white/[0.02] border border-white/[0.04]',
                      'hover:bg-white/[0.04] hover:border-white/[0.08]',
                      'transition-all duration-500 cursor-pointer'
                    )}
                  >
                    {/* Left color accent bar */}
                    <div
                      className="absolute left-0 top-2.5 bottom-2.5 w-px rounded-full opacity-40 group-hover:opacity-90 transition-opacity duration-500"
                      style={{ backgroundColor: theme.color }}
                    />

                    {/* Subtle inner glow on hover */}
                    <div
                      className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                      style={{ boxShadow: `inset 0 0 24px ${theme.color}06` }}
                    />

                    <div className="relative flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-slate-300 group-hover:text-white transition-colors duration-300 truncate">
                        {theme.name}
                      </span>
                      <span
                        className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: `${theme.color}12`,
                          color: theme.color,
                        }}
                      >
                        {stageData?.label}
                      </span>
                    </div>

                    <div className="relative flex items-center gap-2.5 flex-shrink-0 ml-3">
                      <span className="text-[11px] text-slate-500 tabular-nums font-mono">
                        {theme.score}
                      </span>
                      <span
                        className={cn(
                          'text-[11px] font-medium tabular-nums',
                          theme.change > 0
                            ? 'text-emerald-400/80'
                            : 'text-red-400/80'
                        )}
                      >
                        {theme.change > 0 ? '+' : ''}
                        {theme.change}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* ── CTA ── */}
        <motion.div
          ref={ctaRef}
          initial={{ opacity: 0, y: 16 }}
          animate={ctaInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
          className="text-center"
        >
          <Link
            href="/themes"
            className={cn(
              'inline-flex items-center gap-2',
              'text-sm font-medium text-slate-400',
              'hover:text-emerald-400',
              'transition-colors duration-300 group'
            )}
          >
            테마 인텔리전스 살펴보기
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-300" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export default ThemePreviewSection;
