/** 패턴 비교 근거의 산출 여부 */
'use client'

import React from 'react'
import { motion } from 'framer-motion'

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
        available={curveSim !== null}
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
  const hasSignal = available && value > 0
  const status = available ? (hasSignal ? '근거 있음' : '신호 없음') : '미산출'
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-500 w-14 shrink-0 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
        {available ? (
          <motion.div
            className={`h-full rounded-full ${color}`}
            initial={{ width: 0 }}
            animate={{ width: hasSignal ? '100%' : '0%' }}
            transition={{ duration: 0.6, delay }}
          />
        ) : (
          <div className="h-full w-full border border-dashed border-slate-700/70 rounded-full bg-slate-800/40" />
        )}
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-14 text-right">
        {status}
      </span>
    </div>
  )
}
