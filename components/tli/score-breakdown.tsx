'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Info } from 'lucide-react'

/** raw 수치 타입 */
interface ScoreRaw {
  recent7dAvg: number
  baseline30dAvg: number
  newsThisWeek: number
  newsLastWeek: number
  interestStddev: number
  activeDays: number
  sentimentAvg?: number
  sentimentArticleCount?: number
}

interface ScoreBreakdownProps {
  components: {
    interest: number
    newsMomentum: number
    sentiment: number
    volatility: number
  }
  /** 각 항목의 raw 수치 (툴팁/상세 표시용) */
  raw?: ScoreRaw | null
}

/** 항목별 고유 색상 + 가중치 + 라벨 */
const COMPONENT_CONFIG = {
  interest: {
    label: '검색 관심',
    weightNum: 40,
    weight: '40%',
    color: '#10B981',
    colorFrom: '#10B981',
    colorTo: '#059669',
    glow: 'rgba(16, 185, 129, 0.3)',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/20',
    rawLabel: (raw: ScoreRaw) => `최근7일 평균: ${raw.recent7dAvg.toFixed(1)} / 기준30일: ${raw.baseline30dAvg.toFixed(1)}`,
  },
  newsMomentum: {
    label: '뉴스 모멘텀',
    weightNum: 25,
    weight: '25%',
    color: '#F59E0B',
    colorFrom: '#F59E0B',
    colorTo: '#D97706',
    glow: 'rgba(245, 158, 11, 0.3)',
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    rawLabel: (raw: ScoreRaw) => `이번주 ${raw.newsThisWeek}건 / 지난주 ${raw.newsLastWeek}건`,
  },
  sentiment: {
    label: '기사 논조',
    weightNum: 20,
    weight: '20%',
    color: '#A855F7',
    colorFrom: '#A855F7',
    colorTo: '#9333EA',
    glow: 'rgba(168, 85, 247, 0.3)',
    bg: 'bg-purple-500/5',
    border: 'border-purple-500/20',
    rawLabel: (raw: ScoreRaw) => {
      const avg = raw.sentimentAvg ?? 0
      const count = raw.sentimentArticleCount ?? 0
      const label = avg > 0.1 ? '긍정적' : avg < -0.1 ? '부정적' : '중립'
      return `평균 논조: ${avg.toFixed(2)} (${label}) / ${count}건 분석`
    },
  },
  volatility: {
    label: '변동성',
    weightNum: 15,
    weight: '15%',
    color: '#0EA5E9',
    colorFrom: '#0EA5E9',
    colorTo: '#0284C7',
    glow: 'rgba(14, 165, 233, 0.3)',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/20',
    rawLabel: (raw: ScoreRaw) => `표준편차: ${raw.interestStddev.toFixed(2)}`,
  },
} as const

export default function ScoreBreakdown({ components, raw }: ScoreBreakdownProps) {
  return (
    <div className="space-y-3">
      {(Object.entries(components) as [keyof typeof COMPONENT_CONFIG, number][]).map(
        ([key, value], index) => {
          const config = COMPONENT_CONFIG[key]
          const percentage = Math.min(Math.max(value * 100, 0), 100)
          const contribution = (value * config.weightNum)

          return (
            <ComponentRow
              key={key}
              config={config}
              value={value}
              percentage={percentage}
              contribution={contribution}
              raw={raw}
              index={index}
            />
          )
        }
      )}
    </div>
  )
}

/** 개별 컴포넌트 행 */
function ComponentRow({
  config,
  value,
  percentage,
  contribution,
  raw,
  index
}: {
  config: typeof COMPONENT_CONFIG[keyof typeof COMPONENT_CONFIG]
  value: number
  percentage: number
  contribution: number
  raw?: ScoreRaw | null
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
        hover:border-opacity-40 hover:shadow-lg
      `}
      style={{
        boxShadow: `0 0 0 0 ${config.glow}`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 20px ${config.glow}`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 0 ${config.glow}`
      }}
    >
      {/* 상단: 라벨 + 메트릭 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-sm font-mono font-bold tracking-wide"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
            <span
              className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md"
              style={{
                backgroundColor: `${config.color}15`,
                color: config.color,
                border: `1px solid ${config.color}30`
              }}
            >
              가중치 {config.weight}
            </span>
          </div>

          {/* 기여도 계산 표시 */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="tabular-nums">{percentage.toFixed(1)}</span>
            <span className="text-slate-700">×</span>
            <span>{config.weightNum}%</span>
            <span className="text-slate-700">=</span>
            <span className="font-bold tabular-nums" style={{ color: config.color }}>
              {contribution.toFixed(1)}pt
            </span>
          </div>
        </div>

        {/* 값 표시 */}
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums" style={{ color: config.color }}>
            {percentage.toFixed(0)}
          </div>
          <div className="text-[10px] font-mono text-slate-600">/ 100</div>
        </div>
      </div>

      {/* 프로그레스 바 (더 두껍고 고급스럽게) */}
      <div className="relative h-4 rounded-full bg-slate-800/60 border border-slate-700/40 overflow-hidden mb-3">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/20 to-transparent" />

        {/* 메인 프로그레스 */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${config.colorFrom}dd 0%, ${config.colorTo} 100%)`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 1.2,
            delay: index * 0.1 + 0.3,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        />

        {/* 엔드 캡 인디케이터 */}
        <motion.div
          className="absolute inset-y-0 w-2 rounded-full shadow-lg"
          style={{
            backgroundColor: config.color,
            boxShadow: `0 0 12px ${config.glow}`
          }}
          initial={{ left: 0, opacity: 0 }}
          animate={{
            left: `calc(${percentage}% - 8px)`,
            opacity: percentage > 3 ? 1 : 0
          }}
          transition={{
            duration: 1.2,
            delay: index * 0.1 + 0.3,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
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
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
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
                    {config.rawLabel(raw)}
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
