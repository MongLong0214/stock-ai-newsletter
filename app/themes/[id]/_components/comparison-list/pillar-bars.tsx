/** 3-Pillar 유사도 바 시각화 */
'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { SCORE_COMPONENTS } from '@/lib/tli/constants/score-config'

/* ── 유사도 임계값 상수 ─────────────────────────────────────────── */

const SIMILARITY_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.4,
} as const

// 점수 컴포넌트 색상 (score-config.ts와 일치)
const COLORS = {
  emerald: SCORE_COMPONENTS[0].color, // #10B981 (interest)
  sky: SCORE_COMPONENTS[1].color,     // #0EA5E9 (newsMomentum)
  amber: '#F59E0B',                   // 장식용
  slate: '#64748B',                   // 낮은 유사도 fallback
} as const

/** 유사도에 따른 색상 */
export function getSimilarityColor(similarity: number): string {
  if (similarity >= SIMILARITY_THRESHOLDS.high) return COLORS.emerald
  if (similarity >= SIMILARITY_THRESHOLDS.medium) return COLORS.sky
  if (similarity >= SIMILARITY_THRESHOLDS.low) return COLORS.amber
  return COLORS.slate
}

/** 유사도 강도 뱃지 (색상 임계값과 별도 — 뱃지는 더 세분화) */
export function getSimilarityBadge(similarity: number): { label: string; bg: string; text: string; border: string } {
  if (similarity >= 0.7) return { label: '매우 유사', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' }
  if (similarity >= 0.5) return { label: '유사', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' }
  if (similarity >= 0.25) return { label: '다소 비슷', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' }
  return { label: '참고', bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' }
}

/* ── PillarBars 컴포넌트 ────────────────────────────────────────── */

interface PillarBarsProps {
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  idx: number
}

export default function PillarBars({ featureSim, curveSim, keywordSim, idx }: PillarBarsProps) {
  return (
    <div className="space-y-1.5 mb-3">
      <PillarRow
        label="핵심 지표"
        value={featureSim ?? 0}
        available={featureSim !== null}
        color="bg-sky-500/70"
        delay={idx * 0.1}
      />
      <PillarRow
        label="추세 흐름"
        value={curveSim ?? 0}
        available={curveSim !== null && curveSim > 0}
        color="bg-emerald-500/70"
        delay={idx * 0.1 + 0.05}
      />
      <PillarRow
        label="연관어"
        value={keywordSim ?? 0}
        available={keywordSim !== null}
        color="bg-amber-500/70"
        delay={idx * 0.1 + 0.1}
      />
    </div>
  )
}

function PillarRow({
  label,
  value,
  available,
  color,
  delay,
}: {
  label: string
  value: number
  available: boolean
  color: string
  delay: number
}) {
  const pct = Math.min(99, Math.round(value * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-500 w-14 shrink-0 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
        {available ? (
          <motion.div
            className={`h-full rounded-full ${color}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, delay }}
          />
        ) : (
          <div className="h-full w-full border border-dashed border-slate-700/70 rounded-full bg-slate-800/40" />
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-12 text-right">
        {available ? `${pct}%` : '미산출'}
      </span>
    </div>
  )
}
