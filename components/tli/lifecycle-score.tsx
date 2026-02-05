'use client'

import { motion } from 'framer-motion'
import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface LifecycleScoreProps {
  score: number
  stage: Stage
  change24h?: number
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CONFIG = {
  sm: { dimension: 80, strokeWidth: 8, fontSize: 'text-xl', labelSize: 'text-xs' },
  md: { dimension: 120, strokeWidth: 12, fontSize: 'text-3xl', labelSize: 'text-sm' },
  lg: { dimension: 160, strokeWidth: 16, fontSize: 'text-5xl', labelSize: 'text-base' },
}

export default function LifecycleScore({
  score,
  stage,
  change24h,
  size = 'md'
}: LifecycleScoreProps) {
  const config = SIZE_CONFIG[size]
  const stageConfig = STAGE_CONFIG[stage]
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
          className="transform -rotate-90"
        >
          <defs>
            <filter id={`glow-${stage}`}>
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background ring */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={config.strokeWidth}
          />

          {/* Progress ring with glow */}
          <motion.circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            fill="none"
            stroke={stageConfig.color}
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            filter={`url(#glow-${stage})`}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            className={`${config.fontSize} font-mono font-black text-white`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {Math.round(score)}
          </motion.div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div
          className={`${config.labelSize} font-medium`}
          style={{ color: stageConfig.color }}
        >
          {stageConfig.label}
        </div>

        {change24h !== undefined && (
          <div className="flex items-center gap-1">
            {change24h > 0 ? (
              <ArrowUp className="w-3 h-3 text-emerald-400" />
            ) : change24h < 0 ? (
              <ArrowDown className="w-3 h-3 text-red-400" />
            ) : null}
            <span
              className={`text-xs font-mono ${
                change24h > 0
                  ? 'text-emerald-400'
                  : change24h < 0
                    ? 'text-red-400'
                    : 'text-slate-400'
              }`}
            >
              {change24h > 0 ? '+' : ''}{change24h?.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
