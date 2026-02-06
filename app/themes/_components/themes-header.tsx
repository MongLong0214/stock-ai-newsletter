'use client'

import { motion } from 'framer-motion'
import { TrendingUp, Flame } from 'lucide-react'
import type { ThemeRanking } from '@/lib/tli/types'

interface ThemesHeaderProps {
  summary: ThemeRanking['summary'] | null
}

/** 스테이지별 분포 표시 */
const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  Early: { label: '초기', color: 'bg-emerald-500' },
  Growth: { label: '성장', color: 'bg-sky-500' },
  Peak: { label: '과열', color: 'bg-amber-500' },
  Decay: { label: '말기', color: 'bg-red-500' },
}

/** 테마 페이지 헤더 컴포넌트 */
function ThemesHeader({ summary }: ThemesHeaderProps) {
  const totalThemes = summary?.totalThemes ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-12"
    >
      {/* 타이틀 */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-1 bg-emerald-500 rounded-full" />
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          <span className="text-white">테마</span>
          <span className="text-emerald-400 ml-2">트래커</span>
        </h1>
      </div>
      <p className="text-slate-400 text-lg ml-4 mb-6">
        AI가 추적하는 한국 주식시장 테마의 생명주기 단계와 점수 변화
      </p>

      {/* 요약 통계 */}
      {summary && (
        <div className="ml-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* 추적 중 */}
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-slate-500 font-mono">
              {totalThemes}개 추적 중
            </span>
          </div>

          {/* 스테이지 분포 */}
          <div className="flex items-center gap-2">
            {Object.entries(STAGE_LABELS).map(([key, { label, color }]) => {
              const count = summary.byStage[key] ?? 0
              if (count === 0) return null
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                  {label} {count}
                </span>
              )
            })}
          </div>

          {/* 가장 뜨거운 테마 */}
          {summary.hottestTheme && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <Flame className="w-3 h-3 text-amber-500" />
              <span>
                <span className="text-white font-medium">{summary.hottestTheme.name}</span>
                {' '}
                <span className="text-amber-400">{Math.round(summary.hottestTheme.score)}점</span>
              </span>
            </div>
          )}

          {/* 최고 상승 */}
          {summary.mostImproved && summary.mostImproved.change7d > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span>
                <span className="text-white font-medium">{summary.mostImproved.name}</span>
                {' '}
                <span className="text-emerald-400">+{summary.mostImproved.change7d.toFixed(1)}</span>
              </span>
            </div>
          )}

          {/* 업데이트 날짜 */}
          <span className="text-xs text-slate-600 font-mono" suppressHydrationWarning>
            {new Date().toLocaleDateString('ko-KR')} 기준
          </span>
        </div>
      )}
    </motion.div>
  )
}

export default ThemesHeader
