'use client'

import { motion } from 'framer-motion'

/** raw 수치 타입 */
interface ScoreRaw {
  recent7dAvg: number
  baseline30dAvg: number
  newsThisWeek: number
  newsLastWeek: number
  interestStddev: number
  activeDays: number
}

interface ScoreBreakdownProps {
  components: {
    interest: number
    newsMomentum: number
    volatility: number
  }
  /** 각 항목의 raw 수치 (툴팁/상세 표시용) */
  raw?: ScoreRaw | null
}

/** 항목별 고유 색상 + 가중치 + 라벨 */
const COMPONENT_CONFIG = {
  interest: {
    label: '검색 관심',
    weight: '50%',
    color: '#10B981',
    colorFrom: '#10B981',
    colorTo: '#059669',
    glow: 'rgba(16, 185, 129, 0.4)',
    rawLabel: (raw: ScoreRaw) => `최근7일 평균: ${raw.recent7dAvg.toFixed(1)} / 기준30일: ${raw.baseline30dAvg.toFixed(1)}`,
  },
  newsMomentum: {
    label: '뉴스 모멘텀',
    weight: '35%',
    color: '#F59E0B',
    colorFrom: '#F59E0B',
    colorTo: '#D97706',
    glow: 'rgba(245, 158, 11, 0.4)',
    rawLabel: (raw: ScoreRaw) => `이번주 ${raw.newsThisWeek}건 / 지난주 ${raw.newsLastWeek}건`,
  },
  volatility: {
    label: '변동성',
    weight: '15%',
    color: '#0EA5E9',
    colorFrom: '#0EA5E9',
    colorTo: '#0284C7',
    glow: 'rgba(14, 165, 233, 0.4)',
    rawLabel: (raw: ScoreRaw) => `표준편차: ${raw.interestStddev.toFixed(2)}`,
  },
} as const

export default function ScoreBreakdown({ components, raw }: ScoreBreakdownProps) {
  return (
    <div className="space-y-5">
      {(Object.entries(components) as [keyof typeof COMPONENT_CONFIG, number][]).map(
        ([key, value], index) => {
          const config = COMPONENT_CONFIG[key]
          const percentage = Math.min(Math.max(value * 100, 0), 100)

          return (
            <div key={key} className="space-y-2">
              {/* 라벨 + 가중치 + 값 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-mono font-medium tracking-wider"
                    style={{ color: config.color }}
                  >
                    {config.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600 px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/30">
                    {config.weight}
                  </span>
                </div>
                <span className="text-sm font-mono font-medium text-white tabular-nums">
                  {percentage.toFixed(1)}
                </span>
              </div>

              {/* 프로그레스 바 */}
              <div className="relative h-2.5 rounded-full bg-slate-800/50 border border-slate-700/30 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${config.colorFrom} 0%, ${config.colorTo} 100%)`,
                    boxShadow: `0 0 12px ${config.glow}`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{
                    duration: 1,
                    delay: index * 0.1,
                    ease: 'easeOut',
                  }}
                />
              </div>

              {/* raw 수치 표시 */}
              {raw && (
                <p className="text-[11px] font-mono text-slate-500 pl-0.5">
                  {config.rawLabel(raw)}
                </p>
              )}
            </div>
          )
        }
      )}
    </div>
  )
}
