'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react'
import { type Stage, STAGE_CONFIG } from '@/lib/tli/types'
import StageBadge from './stage-badge'

interface ThemeCardProps {
  theme: {
    id: string
    name: string
    nameEn: string | null
    score: number
    stage: Stage
    stageKo: string
    change7d: number
    stockCount: number
    isReigniting: boolean
  }
  href?: string
}

export default function ThemeCard({ theme, href }: ThemeCardProps) {
  const stageConfig = STAGE_CONFIG[theme.stage]
  const isPositiveChange = theme.change7d > 0
  const linkHref = href || `/themes/${theme.id}`

  return (
    <Link href={linkHref}>
      <motion.article
        className="group relative h-full flex flex-col rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 transition-all duration-500 hover:border-emerald-500/40"
        whileHover={{
          scale: 1.02,
          transition: { duration: 0.2 }
        }}
        style={{
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 20px 60px rgba(16, 185, 129, 0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Reigniting indicator */}
        {theme.isReigniting && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-1 rounded-full bg-orange-500/20 border border-orange-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-xs font-medium text-orange-400">재점화 감지</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white mb-1 truncate group-hover:text-emerald-400 transition-colors duration-300">
              {theme.name}
            </h3>
            {theme.nameEn && (
              <p className="text-sm text-slate-400 truncate">{theme.nameEn}</p>
            )}
          </div>
          <StageBadge stage={theme.stage} showIcon size="sm" />
        </div>

        {/* Score display */}
        <div className="flex items-end gap-2 mb-4">
          <div
            className="text-5xl font-black font-mono"
            style={{ color: stageConfig.color }}
          >
            {Math.round(theme.score)}
          </div>
          <div className="pb-2">
            <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">
              TLI Score
            </div>
          </div>
        </div>

        {/* Change indicator */}
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700/50">
          {isPositiveChange ? (
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-400" />
          )}
          <span
            className={`text-sm font-mono font-medium ${
              isPositiveChange ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {isPositiveChange ? '+' : ''}{theme.change7d.toFixed(1)}%
          </span>
          <span className="text-xs text-slate-500">7일 변화</span>
        </div>

        {/* Stock count */}
        <div className="flex items-center gap-2 mt-auto">
          <TrendingUp className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400">
            관련 종목 <span className="font-mono font-medium text-white">{theme.stockCount}</span>개
          </span>
        </div>
      </motion.article>
    </Link>
  )
}
