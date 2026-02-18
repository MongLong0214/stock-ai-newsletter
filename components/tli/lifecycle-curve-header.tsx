'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import StageBadge from './stage-badge'
import { formatScoreChange } from '@/lib/tli/format-utils'
import type { Stage, ConfidenceLevel } from '@/lib/tli/types'

interface LifecycleCurveHeaderProps {
  score: number
  stage: Stage
  change24h: number
  change7d: number
  confidence: { level: ConfidenceLevel } | null
  comparisonCount: number
  /** 선택된 시간 범위의 점수 변동 */
  rangeDelta?: { label: string; value: number } | null
}

const CONFIDENCE_DOT: Record<ConfidenceLevel, { color: string; label: string }> = {
  high: { color: 'bg-emerald-400', label: '높음' },
  medium: { color: 'bg-amber-400', label: '보통' },
  low: { color: 'bg-red-400', label: '낮음' },
}

/** 카운트업 애니메이션 숫자 */
const AnimatedScore = ({ value }: { value: number }) => {
  const shouldReduceMotion = useReducedMotion()
  const spring = useSpring(0, { stiffness: 60, damping: 20 })
  const display = useTransform(spring, (v) => Math.round(v))
  const [displayValue, setDisplayValue] = useState(0)
  const initialized = useRef(false)

  useEffect(() => {
    if (shouldReduceMotion || initialized.current) {
      spring.set(value)
    } else {
      // 초기 애니메이션: 약간의 딜레이 후 시작
      const timer = setTimeout(() => spring.set(value), 300)
      initialized.current = true
      return () => clearTimeout(timer)
    }
  }, [value, spring, shouldReduceMotion])

  useEffect(() => {
    const unsubscribe = display.on('change', (v) => setDisplayValue(v))
    return unsubscribe
  }, [display])

  return (
    <motion.span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white">
      {displayValue}
    </motion.span>
  )
}

/** 변동 표시 칩 */
const ChangeBadge = ({ label, value }: { label: string; value: number }) => {
  if (value === 0) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-slate-500 font-mono">{label}</span>
        <span className="text-xs font-mono text-slate-500">—</span>
      </div>
    )
  }

  const isPositive = value > 0
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-slate-500 font-mono">{label}</span>
      <span className={`text-xs font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {formatScoreChange(value)}
      </span>
    </div>
  )
}

export const LifecycleCurveHeader = ({
  score,
  stage,
  change24h,
  change7d,
  confidence,
  comparisonCount,
  rangeDelta,
}: LifecycleCurveHeaderProps) => {
  const confDot = confidence ? CONFIDENCE_DOT[confidence.level] : null

  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4">
      {/* 타이틀 */}
      <h2 className="text-lg font-bold shrink-0">
        <span className="text-white">점수</span>
        <span className="text-emerald-400 ml-1">추이</span>
      </h2>

      {/* 스테이지 뱃지 */}
      <StageBadge stage={stage} size="sm" />

      {/* 스코어 숫자 */}
      <AnimatedScore value={score} />

      {/* 구분선 */}
      <div className="w-px h-6 bg-slate-700/50 hidden sm:block" />

      {/* 24H / 7D 변동 */}
      <div className="flex items-center gap-3">
        <ChangeBadge label="24H" value={change24h} />
        <ChangeBadge label="7D" value={change7d} />
      </div>

      {/* 신뢰도 */}
      {confDot && (
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${confDot.color}`} />
          <span className="text-[10px] font-mono text-slate-500">{confDot.label}</span>
        </div>
      )}

      {/* 비교 테마 수 */}
      {comparisonCount > 0 && (
        <span className="text-xs font-mono text-sky-400 ml-auto">
          {comparisonCount}개 비교 중
        </span>
      )}

      {/* 구간 변동 pill */}
      {rangeDelta && rangeDelta.value !== 0 && (
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
          rangeDelta.value > 0
            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            : 'text-red-400 bg-red-500/10 border-red-500/20'
        }`}>
          {rangeDelta.label} {formatScoreChange(rangeDelta.value)}
        </span>
      )}
    </div>
  )
}
