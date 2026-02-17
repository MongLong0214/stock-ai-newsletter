/** 점수 구성 상세 분석 — 프로그레스 바 + raw 데이터 토글 */
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Info } from 'lucide-react'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'
import type { ScoreRawData } from '@/lib/tli/types'

interface ScoreBreakdownProps {
  components: {
    interest: number
    newsMomentum: number
    volatility: number
    activity?: number
  }
  raw?: ScoreRawData | null
}

/** raw 데이터 라벨 생성 */
function getRawLabel(key: string, raw: ScoreRawData): string {
  switch (key) {
    case 'interest':
      return `최근7일 평균: ${raw.recent7dAvg.toFixed(1)} / 기준30일: ${raw.baseline30dAvg.toFixed(1)}`
    case 'newsMomentum':
      return `이번주 ${raw.newsThisWeek}건 / 지난주 ${raw.newsLastWeek}건`
    case 'volatility':
      return `표준편차: ${raw.interestStddev.toFixed(2)}`
    case 'activity':
      return `활동일수: ${raw.activeDays}일`
    default:
      return ''
  }
}

export default function ScoreBreakdown({ components, raw }: ScoreBreakdownProps) {
  return (
    <div className="space-y-3">
      {SCORE_COMPONENTS.map((config, index) => {
        const value = components[config.key] ?? 0
        const percentage = Math.min(Math.max(value * 100, 0), 100)
        const contribution = value * config.weight
        return (
          <ComponentRow
            key={config.key}
            config={config}
            percentage={percentage}
            contribution={contribution}
            raw={raw}
            index={index}
          />
        )
      })}
    </div>
  )
}

/** 개별 컴포넌트 행 */
function ComponentRow({
  config,
  percentage,
  contribution,
  raw,
  index,
}: {
  config: (typeof SCORE_COMPONENTS)[number]
  percentage: number
  contribution: number
  raw?: ScoreRawData | null
  index: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className={`
        rounded-xl border p-4 transition-all duration-300
        ${config.bg} ${config.border}
        hover:border-opacity-40 hover:shadow-[0_0_20px_var(--glow-color)]
      `}
      style={{ '--glow-color': config.glow } as React.CSSProperties}
    >
      {/* 상단: 라벨 + 메트릭 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono font-bold tracking-wide" style={{ color: config.color }}>
              {config.label}
            </span>
            <span
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md"
              style={{ backgroundColor: `${config.color}15`, color: config.color, border: `1px solid ${config.color}30` }}
            >
              가중치 {config.weightLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="tabular-nums">{percentage.toFixed(1)}</span>
            <span className="text-slate-700">×</span>
            <span>{config.weight}%</span>
            <span className="text-slate-700">=</span>
            <span className="font-bold tabular-nums" style={{ color: config.color }}>
              {contribution.toFixed(1)}pt
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color: config.color }}>
            {percentage.toFixed(0)}
          </div>
          <div className="text-[10px] font-mono text-slate-600">/ 100</div>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="relative h-4 rounded-full bg-slate-800/60 border border-slate-700/40 overflow-hidden mb-3">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/20 to-transparent" />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${config.colorFrom}dd 0%, ${config.colorTo} 100%)` }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.2, delay: index * 0.1 + 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
        <motion.div
          className="absolute inset-y-0 w-2 rounded-full shadow-lg"
          style={{ backgroundColor: config.color, boxShadow: `0 0 12px ${config.glow}` }}
          initial={{ left: 0, opacity: 0 }}
          animate={{ left: `calc(${percentage}% - 8px)`, opacity: percentage > 3 ? 1 : 0 }}
          transition={{ duration: 1.2, delay: index * 0.1 + 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>

      {/* Raw 데이터 토글 */}
      {raw && (
        <div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 hover:text-slate-400 transition-colors group"
          >
            <Info className="w-3 h-3" />
            <span>상세 데이터</span>
            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-3 h-3" />
            </motion.div>
          </button>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                    {getRawLabel(config.key, raw)}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}
