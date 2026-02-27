/** 테마 상세 헤더 — 타이틀, 뱃지, 키워드, 메트릭, 점수 구성, 주요 종목 */
'use client'

import { useMemo } from 'react'
import { useReducedMotion, motion } from 'framer-motion'
import { Zap, Hash } from 'lucide-react'
import StageBadge from '@/components/tli/stage-badge'
import LifecycleScore from '@/components/tli/lifecycle-score'
import { GlassCard } from '@/components/tli/glass-card'
import { daysBetween } from '@/lib/tli/normalize'
import type { ThemeDetail } from '@/lib/tli/types'
import MetricGrid from './metric-grid'
import ScoreComponents from './score-components'
import TopMovers from './top-movers'

const MAX_VISIBLE_KEYWORDS = 8

interface DetailHeaderProps {
  theme: ThemeDetail
}

function DetailHeader({ theme }: DetailHeaderProps) {
  const shouldReduceMotion = useReducedMotion()

  const themeAge = useMemo(() => {
    if (!theme.firstSpikeDate) return null
    return daysBetween(theme.firstSpikeDate, new Date().toISOString())
  }, [theme.firstSpikeDate])

  return (
    <GlassCard className="p-4 sm:p-6 mb-6 sm:mb-8">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* ── Row 1: 타이틀 + 게이지 ──────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 sm:gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black">{theme.name}</h1>
              <StageBadge stage={theme.score.stage} showIcon size="md" />
              {theme.score.isReigniting && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
                  <Zap className="w-3 h-3" />
                  재점화
                </span>
              )}
            </div>
            {theme.nameEn && <p className="text-slate-500 text-lg">{theme.nameEn}</p>}
            {theme.description && <p className="text-slate-400 mt-2 max-w-2xl text-sm">{theme.description}</p>}

            {/* 키워드 태그 */}
            {theme.keywords && theme.keywords.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 mt-3">
                <Hash className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                {theme.keywords.slice(0, MAX_VISIBLE_KEYWORDS).map((keyword, i) => (
                  <motion.span
                    key={keyword}
                    initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="px-2 py-0.5 rounded-md bg-slate-800/40 border border-slate-700/40 text-[10px] font-mono text-slate-400 hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
                  >
                    {keyword}
                  </motion.span>
                ))}
                {theme.keywords.length > MAX_VISIBLE_KEYWORDS && (
                  <span className="text-[10px] font-mono text-slate-600">+{theme.keywords.length - MAX_VISIBLE_KEYWORDS}</span>
                )}
              </div>
            )}

            <MetricGrid theme={theme} themeAge={themeAge} />
          </div>

          <div className="flex-shrink-0">
            <LifecycleScore score={theme.score.value} stage={theme.score.stage} change24h={theme.score.change24h} size="lg" />
          </div>
        </div>

        {/* ── Row 2: 점수 구성 + 주요 종목 ───────────────────────── */}
        <div className="mt-6 pt-6 border-t border-slate-700/40 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ScoreComponents components={theme.score.components} />
          <TopMovers stocks={theme.stocks} />
        </div>
      </motion.div>
    </GlassCard>
  )
}

export default DetailHeader
