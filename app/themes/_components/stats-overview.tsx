'use client'

import { motion } from 'framer-motion'
import { Flame, Rocket, BarChart3, Layers } from 'lucide-react'
import { STAGE_CONFIG } from '@/lib/tli/types'
import type { ThemeRanking } from '@/lib/tli/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface StatsOverviewProps {
  summary: ThemeRanking['summary']
}

/** 테마 요약 통계 바 컴포넌트 */
function StatsOverview({ summary }: StatsOverviewProps) {
  const stageEntries = Object.entries(summary.byStage).filter(
    ([stage]) => stage !== 'Dormant'
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="mb-8"
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <div className="flex flex-wrap items-center gap-4 lg:gap-6">
          {/* 총 테마 수 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">Total</p>
              <p className="text-lg font-bold text-white font-mono">{summary.totalThemes}</p>
            </div>
          </div>

          {/* 구분선 */}
          <div className="hidden sm:block h-10 w-px bg-white/10" />

          {/* 단계별 카운트 */}
          <div className="flex items-center gap-3 flex-wrap">
            {stageEntries.map(([stage, count]) => {
              const config = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG]
              if (!config) return null
              return (
                <div
                  key={stage}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium',
                    config.bg,
                    config.border,
                    config.text
                  )}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span>{config.label}</span>
                  <span className="font-mono font-bold">{count}</span>
                </div>
              )
            })}
          </div>

          {/* 구분선 */}
          <div className="hidden lg:block h-10 w-px bg-white/10" />

          {/* 주도 테마 */}
          {summary.hottestTheme && (
            <Link href={`/themes/${summary.hottestTheme.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20"
                style={{ boxShadow: '0 0 12px rgba(245, 158, 11, 0.15)' }}
              >
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">Hottest</p>
                <p className="text-sm font-bold text-amber-400">
                  {summary.hottestTheme.name}
                  <span className="ml-1.5 font-mono text-amber-300">
                    {Math.round(summary.hottestTheme.score)}
                  </span>
                </p>
              </div>
            </Link>
          )}

          {/* 구분선 */}
          <div className="hidden lg:block h-10 w-px bg-white/10" />

          {/* 급상승 테마 */}
          {summary.surging && (
            <Link href={`/themes/${summary.surging.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20"
                style={{ boxShadow: '0 0 12px rgba(16, 185, 129, 0.15)' }}
              >
                <Rocket className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">급상승</p>
                <p className="text-sm font-bold text-emerald-400">
                  {summary.surging.name}
                  <span className="ml-1.5 font-mono text-emerald-300">
                    +{summary.surging.change7d.toFixed(1)}
                  </span>
                </p>
              </div>
            </Link>
          )}

          {/* 구분선 */}
          <div className="hidden lg:block h-10 w-px bg-white/10" />

          {/* 평균 점수 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/20">
              <BarChart3 className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">Avg Score</p>
              <p className="text-lg font-bold text-sky-400 font-mono">{summary.avgScore.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default StatsOverview
