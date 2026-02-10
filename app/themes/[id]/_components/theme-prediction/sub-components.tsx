/** 생명주기 예측 서브 컴포넌트 — StatCell, MomentumCell, ScenarioCard */
'use client'

import { Activity } from 'lucide-react'
import type { Momentum, Scenario } from '@/lib/tli/prediction'
import { MOMENTUM_CONFIG } from './config'

/* ── StatCell ───────────────────────────────────────────────────── */

export function StatCell({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div
      className="rounded-xl border p-3.5 font-mono"
      style={{ borderColor: `${color}20`, backgroundColor: `${color}06` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div style={{ color }}>{icon}</div>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

/* ── MomentumCell ───────────────────────────────────────────────── */

export function MomentumCell({ momentum }: { momentum: Momentum }) {
  const cfg = MOMENTUM_CONFIG[momentum]
  const Icon = cfg.Icon
  return (
    <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3.5 font-mono">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-slate-500" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">모멘텀</span>
      </div>
      <div className={`flex items-center gap-2 text-lg font-bold ${cfg.color}`}>
        <Icon className="w-5 h-5" />
        {cfg.label}
      </div>
    </div>
  )
}

/* ── ScenarioCard ───────────────────────────────────────────────── */

const ACCENT_STYLES: Record<string, { border: string; bg: string; labelColor: string; simColor: string }> = {
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', labelColor: 'text-emerald-400', simColor: 'text-emerald-400' },
  slate:   { border: 'border-slate-700/30',   bg: 'bg-slate-800/30',  labelColor: 'text-slate-300',   simColor: 'text-slate-400' },
  red:     { border: 'border-red-500/20',     bg: 'bg-red-500/5',     labelColor: 'text-red-400',     simColor: 'text-red-400' },
}

export function ScenarioCard({
  label,
  scenario,
  accent,
}: {
  label: string
  scenario: Scenario
  accent: 'emerald' | 'slate' | 'red'
}) {
  const s = ACCENT_STYLES[accent]
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-3.5 font-mono space-y-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.labelColor}`}>{label}</span>
        <span className={`text-[10px] ${s.simColor}`}>{Math.round(scenario.similarity * 100)}%</span>
      </div>
      <p className="text-xs text-slate-300 truncate" title={scenario.themeName}>{scenario.themeName}</p>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>피크 D+{scenario.peakDay}</span>
        <span>주기 {scenario.totalDays}일</span>
      </div>
    </div>
  )
}
