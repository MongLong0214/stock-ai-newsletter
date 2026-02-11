'use client'

import { motion } from 'framer-motion'
import { STAGE_CONFIG, type Stage, type ConfidenceLevel } from '@/lib/tli/types'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface LifecycleScoreProps {
  score: number
  stage: Stage
  change24h?: number
  size?: 'sm' | 'md' | 'lg'
  confidenceLevel?: ConfidenceLevel
}

const SIZE_CONFIG = {
  sm: { dimension: 80, strokeWidth: 6, fontSize: 'text-xl', labelSize: 'text-xs' },
  md: { dimension: 120, strokeWidth: 8, fontSize: 'text-3xl', labelSize: 'text-sm' },
  lg: { dimension: 160, strokeWidth: 10, fontSize: 'text-5xl', labelSize: 'text-base' },
}

/** 생명주기 점수 게이지 컴포넌트 */
export default function LifecycleScore({
  score,
  stage,
  change24h,
  size = 'md',
  confidenceLevel,
}: LifecycleScoreProps) {
  const config = SIZE_CONFIG[size]
  const stageConfig = STAGE_CONFIG[stage]

  const center = config.dimension / 2
  const radius = (config.dimension - config.strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.min(Math.max(score, 0), 100) / 100
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative"
        style={{ width: config.dimension, height: config.dimension }}
      >
        <svg
          width={config.dimension}
          height={config.dimension}
          className="-rotate-90"
        >
          {/* 배경 트랙 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={config.strokeWidth}
          />

          {/* 프로그레스 아크 */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={stageConfig.color}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </svg>

        {/* 중앙 점수 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className={`${config.fontSize} font-mono font-black text-white`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {Math.round(score)}
          </motion.span>
        </div>
      </div>

      {/* 라벨 + 변동 */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block rounded-full"
            style={{
              width: size === 'sm' ? 6 : 8,
              height: size === 'sm' ? 6 : 8,
              backgroundColor: stageConfig.color,
            }}
          />
          <span
            className={`${config.labelSize} font-semibold`}
            style={{ color: stageConfig.color }}
          >
            {stageConfig.label}
          </span>
        </div>

        {change24h !== undefined && (
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono ${
              change24h > 0
                ? 'bg-emerald-500/10 text-emerald-400'
                : change24h < 0
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-slate-500/10 text-slate-400'
            }`}
          >
            {change24h > 0 ? (
              <ArrowUp className="w-3 h-3" />
            ) : change24h < 0 ? (
              <ArrowDown className="w-3 h-3" />
            ) : null}
            <span>
              {change24h > 0 ? '+' : ''}
              {change24h.toFixed(1)}
            </span>
          </div>
        )}
        {confidenceLevel && confidenceLevel !== 'high' && (
          <div className={`px-2 py-0.5 rounded-full text-xs font-mono ${
            confidenceLevel === 'low'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
          }`}>
            {confidenceLevel === 'low' ? '데이터 부족' : '~'}
          </div>
        )}
      </div>
    </div>
  )
}
