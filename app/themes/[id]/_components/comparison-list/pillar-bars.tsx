/** 3-Pillar 유사도 바 시각화 */
'use client'

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
  amber: SCORE_COMPONENTS[2].color,   // #F59E0B (sentiment)
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
  if (similarity >= 0.25) return { label: '약한 유사', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' }
  return { label: '참고', bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' }
}

/* ── PillarBars 컴포넌트 ────────────────────────────────────────── */

interface PillarBarsProps {
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  similarity: number
  idx: number
}

export default function PillarBars({ featureSim, curveSim, keywordSim, similarity, idx }: PillarBarsProps) {
  const simColor = getSimilarityColor(similarity)
  const simPercent = Math.round(similarity * 100)

  return (
    <div className="space-y-1.5 mb-3">
      {/* featureSim: 0도 유의미하므로 항상 표시. curveSim/keywordSim: 0이면 데이터 부재 → 숨김 */}
      {featureSim !== null && (
        <PillarRow label="특성 지표" value={featureSim} color="bg-sky-500/70" delay={idx * 0.1} />
      )}
      {curveSim !== null && curveSim > 0 && (
        <PillarRow label="곡선 흐름" value={curveSim} color="bg-emerald-500/70" delay={idx * 0.1 + 0.05} />
      )}
      {keywordSim !== null && keywordSim > 0 && (
        <PillarRow label="연관어" value={keywordSim} color="bg-amber-500/70" delay={idx * 0.1 + 0.1} />
      )}
      {/* Fallback: pillar 데이터 없으면 단일 바 */}
      {featureSim === null && (
        <div className="relative h-1.5 rounded-full bg-slate-700/40 overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: simColor }}
            initial={{ width: 0 }}
            animate={{ width: `${simPercent}%` }}
            transition={{ duration: 0.8, delay: idx * 0.1 }}
          />
        </div>
      )}
    </div>
  )
}

function PillarRow({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-500 w-12 shrink-0 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay }}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  )
}