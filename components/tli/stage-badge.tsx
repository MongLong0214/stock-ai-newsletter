'use client'

import { STAGE_CONFIG, type Stage } from '@/lib/tli/types'
import { TrendingUp, Flame, TrendingDown, Minus } from 'lucide-react'

interface StageBadgeProps {
  stage: Stage
  showIcon?: boolean
  size?: 'sm' | 'md'
}

const STAGE_ICONS = {
  Dormant: Minus,
  Early: null,
  Growth: TrendingUp,
  Peak: Flame,
  Decay: TrendingDown,
} as const

export default function StageBadge({
  stage,
  showIcon = false,
  size = 'md'
}: StageBadgeProps) {
  const config = STAGE_CONFIG[stage]
  const Icon = STAGE_ICONS[stage]

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs gap-1'
    : 'px-3 py-1 text-sm gap-1.5'

  return (
    <div
      className={`
        inline-flex items-center rounded-full
        ${config.bg} ${config.border} ${config.text}
        border font-medium
        ${sizeClasses}
      `}
      style={{
        boxShadow: `0 0 12px ${config.color}20`
      }}
    >
      {showIcon && Icon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />}
      {showIcon && stage === 'Early' && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
      <span>{config.label}</span>
    </div>
  )
}
