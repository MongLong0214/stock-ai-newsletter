'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Target,
  BarChart3,
  Activity,
  AlertTriangle,
  Lightbulb,
  Shield,
  Zap,
  ChevronRight,
} from 'lucide-react'
import { type Stage } from '@/lib/tli/types'
import {
  calculatePrediction,
  type ConfidenceLevel,
  type Phase,
  type RiskLevel,
  type Momentum,
  type Scenario,
} from '../_utils/calculate-prediction'

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Comparison {
  pastTheme: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
}

interface ThemePredictionProps {
  firstSpikeDate: string | null
  comparisons: Comparison[]
}

/* -------------------------------------------------------------------------- */
/*  Config maps                                                                */
/* -------------------------------------------------------------------------- */

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; bg: string; text: string; border: string }> = {
  high:   { label: '신뢰도 높음', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  medium: { label: '신뢰도 보통', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
  low:    { label: '신뢰도 낮음', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
}

const RISK_CONFIG: Record<RiskLevel, { label: string; bg: string; text: string; border: string; icon: typeof Shield }> = {
  low:      { label: '낮음',   bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: Shield },
  moderate: { label: '보통',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30',   icon: AlertTriangle },
  high:     { label: '높음',   bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30',  icon: AlertTriangle },
  critical: { label: '매우높음', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     icon: Zap },
}

const INSIGHT_BG: Record<RiskLevel, string> = {
  low:      'bg-emerald-500/8 border-emerald-500/20',
  moderate: 'bg-amber-500/8 border-amber-500/20',
  high:     'bg-orange-500/8 border-orange-500/20',
  critical: 'bg-red-500/8 border-red-500/20',
}

const INSIGHT_ICON_COLOR: Record<RiskLevel, string> = {
  low:      'text-emerald-400',
  moderate: 'text-amber-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
}

const PHASE_LABELS: { id: Phase; label: string }[] = [
  { id: 'pre-peak',  label: '초기' },
  { id: 'near-peak', label: '성장' },
  { id: 'at-peak',   label: '피크' },
  { id: 'post-peak', label: '하락' },
  { id: 'declining', label: '종료' },
]

const PHASE_COLORS: Record<Phase, { bg: string; ring: string; text: string; dot: string }> = {
  'pre-peak':  { bg: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: '#10B981' },
  'near-peak': { bg: 'bg-amber-500',   ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: '#F59E0B' },
  'at-peak':   { bg: 'bg-orange-500',  ring: 'ring-orange-500/30',  text: 'text-orange-400',  dot: '#F97316' },
  'post-peak': { bg: 'bg-red-500',     ring: 'ring-red-500/30',     text: 'text-red-400',     dot: '#EF4444' },
  'declining': { bg: 'bg-slate-500',   ring: 'ring-slate-500/30',   text: 'text-slate-400',   dot: '#64748B' },
}

const MOMENTUM_CONFIG: Record<Momentum, { label: string; color: string; Icon: typeof TrendingUp }> = {
  accelerating: { label: '가속 중',  color: 'text-emerald-400', Icon: TrendingUp },
  stable:       { label: '안정',    color: 'text-slate-400',   Icon: Minus },
  decelerating: { label: '감속 중',  color: 'text-amber-400',   Icon: TrendingDown },
}

/* -------------------------------------------------------------------------- */
/*  Animation variants                                                         */
/* -------------------------------------------------------------------------- */

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number], staggerChildren: 0.08 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                             */
/* -------------------------------------------------------------------------- */

function ThemePrediction({ firstSpikeDate, comparisons }: ThemePredictionProps) {
  const prediction = useMemo(
    () => calculatePrediction(firstSpikeDate, comparisons),
    [firstSpikeDate, comparisons],
  )

  if (!prediction) return null

  const confidenceCfg = CONFIDENCE_CONFIG[prediction.confidence]
  const riskCfg = RISK_CONFIG[prediction.riskLevel]
  const RiskIcon = riskCfg.icon

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-5 sm:p-6 space-y-5"
    >
      {/* ── 1. Header Row ───────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold font-mono">
          <span className="text-white">생명주기</span>
          <span className="text-emerald-400 ml-1">참고 지표</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${confidenceCfg.bg} ${confidenceCfg.text} ${confidenceCfg.border}`}>
            {confidenceCfg.label}
          </span>
          <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full border flex items-center gap-1 ${riskCfg.bg} ${riskCfg.text} ${riskCfg.border}`}>
            <RiskIcon className="w-3 h-3" />
            위험 {riskCfg.label}
          </span>
        </div>
      </motion.div>

      {/* ── 2. Key Insight Banner ────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className={`rounded-xl border p-4 flex items-start gap-3 ${INSIGHT_BG[prediction.riskLevel]}`}
      >
        <Lightbulb className={`w-5 h-5 mt-0.5 shrink-0 ${INSIGHT_ICON_COLOR[prediction.riskLevel]}`} />
        <p className="text-sm font-mono text-slate-200 leading-relaxed">
          {prediction.keyInsight}
        </p>
      </motion.div>

      {/* ── 3. Phase Timeline ────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="flex items-center gap-1.5">
          {PHASE_LABELS.map((phase, idx) => {
            const isActive = phase.id === prediction.phase
            const isPast = PHASE_LABELS.findIndex(p => p.id === prediction.phase) > idx
            const colors = PHASE_COLORS[phase.id]
            return (
              <div key={phase.id} className="flex-1 flex flex-col items-center gap-1.5">
                {/* Bar segment */}
                <div className="w-full flex items-center gap-0.5">
                  <div
                    className={`h-2 w-full rounded-full transition-all duration-500 ${
                      isActive
                        ? `${colors.bg} ring-2 ${colors.ring}`
                        : isPast
                          ? `${colors.bg} opacity-40`
                          : 'bg-slate-800'
                    }`}
                  />
                  {idx < PHASE_LABELS.length - 1 && (
                    <ChevronRight className={`w-3 h-3 shrink-0 ${isPast || isActive ? 'text-slate-500' : 'text-slate-700'}`} />
                  )}
                </div>
                {/* Label */}
                <span className={`text-[10px] font-mono ${isActive ? colors.text + ' font-bold' : 'text-slate-600'}`}>
                  {phase.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <motion.div
                    className={`w-1.5 h-1.5 rounded-full ${colors.bg}`}
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
            )
          })}
        </div>
        <p className={`text-xs font-mono text-center ${PHASE_COLORS[prediction.phase].text}`}>
          {prediction.phaseMessage}
        </p>
      </motion.div>

      {/* ── 4. Stats Grid 2x2 ────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <StatCell
          icon={<Clock className="w-4 h-4" />}
          label="경과일"
          value={`D+${prediction.daysSinceSpike}`}
          color="#10B981"
        />
        <StatCell
          icon={<Target className="w-4 h-4" />}
          label="예상 피크"
          value={prediction.avgDaysToPeak > 0 ? `~${prediction.avgDaysToPeak}일` : '도달'}
          color="#F59E0B"
        />
        <StatCell
          icon={<BarChart3 className="w-4 h-4" />}
          label="평균 유사도"
          value={`${Math.round(prediction.avgSimilarity * 100)}%`}
          color="#0EA5E9"
        />
        <MomentumCell momentum={prediction.momentum} />
      </motion.div>

      {/* ── 5. Scenario Cards ────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ScenarioCard
          label="낙관 시나리오"
          scenario={prediction.scenarios.best}
          accent="emerald"
        />
        <ScenarioCard
          label="기본 시나리오"
          scenario={prediction.scenarios.median}
          accent="slate"
        />
        <ScenarioCard
          label="비관 시나리오"
          scenario={prediction.scenarios.worst}
          accent="red"
        />
      </motion.div>

      {/* ── 6. Disclaimer ────────────────────────────────────────────────── */}
      <motion.p
        variants={itemVariants}
        className="text-[10px] font-mono text-slate-500 text-center pt-1"
      >
        과거 유사 테마({prediction.comparisonCount}개) 기반 참고 정보이며, 실제 시장과 다를 수 있습니다
      </motion.p>
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

/** 통계 셀 (2x2 그리드 아이템) */
function StatCell({
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

/** 모멘텀 셀 */
function MomentumCell({ momentum }: { momentum: Momentum }) {
  const cfg = MOMENTUM_CONFIG[momentum]
  const Icon = cfg.Icon
  return (
    <div
      className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-3.5 font-mono"
    >
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

/** 시나리오 카드 */
function ScenarioCard({
  label,
  scenario,
  accent,
}: {
  label: string
  scenario: Scenario
  accent: 'emerald' | 'slate' | 'red'
}) {
  const styles: Record<string, { border: string; bg: string; labelColor: string; simColor: string }> = {
    emerald: {
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/5',
      labelColor: 'text-emerald-400',
      simColor: 'text-emerald-400',
    },
    slate: {
      border: 'border-slate-700/30',
      bg: 'bg-slate-800/30',
      labelColor: 'text-slate-300',
      simColor: 'text-slate-400',
    },
    red: {
      border: 'border-red-500/20',
      bg: 'bg-red-500/5',
      labelColor: 'text-red-400',
      simColor: 'text-red-400',
    },
  }
  const s = styles[accent]

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-3.5 font-mono space-y-2`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.labelColor}`}>
          {label}
        </span>
        <span className={`text-[10px] ${s.simColor}`}>
          {Math.round(scenario.similarity * 100)}%
        </span>
      </div>
      <p className="text-xs text-slate-300 truncate" title={scenario.themeName}>
        {scenario.themeName}
      </p>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>피크 D+{scenario.peakDay}</span>
        <span>주기 {scenario.totalDays}일</span>
      </div>
    </div>
  )
}

export default ThemePrediction
