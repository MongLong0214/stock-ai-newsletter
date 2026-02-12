/** 점수 구성 요소 바 — 가중치 포함 프로그레스 바 */
'use client'

import { motion } from 'framer-motion'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'

interface ScoreComponentsProps {
  components: {
    interest: number
    newsMomentum: number
    volatility: number
  }
}

export default function ScoreComponents({ components }: ScoreComponentsProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-mono text-slate-400 uppercase tracking-wider">점수 구성 요소</h3>
        <span className="text-[10px] font-mono text-slate-600">가중치 적용됨</span>
      </div>
      <div className="space-y-12">
        {SCORE_COMPONENTS.map(({ key, label, color, weight }) => {
          const Icon = getComponentIcon(key)
          const value = components[key]
          const pct = Math.round(value * 100)
          const contribution = Math.round(value * weight)
          return (
            <div key={key} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-xs font-mono text-slate-300">{label}</span>
                  <span className="text-[10px] font-mono text-slate-600">×{weight}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-600">기여도 {contribution}pt</span>
                  <span className="text-xs font-mono font-bold" style={{ color }}>
                    {pct}
                  </span>
                </div>
              </div>
              <div className="relative h-4 rounded-full bg-slate-800/60 overflow-hidden border border-slate-700/40">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: `linear-gradient(90deg, ${color}40 0%, ${color} 100%)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(pct, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 w-1 rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, x: `${Math.min(pct, 100) * 0.99}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 아이콘 매핑 (score-config에는 아이콘 없음) ──────────────────── */

import { Eye, Newspaper, LineChart } from 'lucide-react'
import type { ScoreComponentKey } from '@/lib/tli/constants/score-config'

function getComponentIcon(key: ScoreComponentKey) {
  const icons = { interest: Eye, newsMomentum: Newspaper, volatility: LineChart }
  return icons[key]
}
