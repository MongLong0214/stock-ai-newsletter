'use client'

import { motion } from 'framer-motion'

interface ScoreBreakdownProps {
  components: {
    interest: number
    newsMomentum: number
    volatility: number
    maturity: number
  }
}

const COMPONENT_LABELS = {
  interest: '검색 관심',
  newsMomentum: '뉴스 모멘텀',
  volatility: '변동성',
  maturity: '성숙도',
}

export default function ScoreBreakdown({ components }: ScoreBreakdownProps) {
  return (
    <div className="space-y-4">
      {Object.entries(components).map(([key, value], index) => {
        const percentage = Math.min(Math.max(value * 100, 0), 100)
        const label = COMPONENT_LABELS[key as keyof typeof COMPONENT_LABELS]

        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400 font-mono uppercase tracking-wider">
                {label}
              </span>
              <span className="text-sm font-mono font-medium text-white tabular-nums">
                {Math.min(value * 100, 100).toFixed(1)}
              </span>
            </div>

            <div className="relative h-2 rounded-full bg-slate-800/50 border border-slate-700/30 overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                }}
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{
                  duration: 1,
                  delay: index * 0.1,
                  ease: 'easeOut'
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
