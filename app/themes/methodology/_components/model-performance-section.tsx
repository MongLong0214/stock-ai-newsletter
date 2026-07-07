'use client'

import { motion } from 'framer-motion'
import { BarChart3, CalendarDays, Gauge, ShieldCheck, Target, Waves } from 'lucide-react'

import { GlassCard } from '@/components/tli/glass-card'
import type { MethodologyMetricsSummary } from '@/lib/tli/methodology-metrics'

const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
}

interface ModelPerformanceSectionProps {
  metrics: MethodologyMetricsSummary
}

interface MetricTile {
  label: string
  value: string
  detail: string
  icon: typeof Target
  tone: string
}

export function ModelPerformanceSection({ metrics }: ModelPerformanceSectionProps) {
  const tiles: MetricTile[] = [
    {
      label: '상위 신호 적중률',
      value: formatPercent(metrics.pAt10),
      detail: '높을수록 좋음',
      icon: Target,
      tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: '예측 오차',
      value: formatDecimal(metrics.brier),
      detail: '낮을수록 좋음',
      icon: Gauge,
      tone: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    },
    {
      label: '확률 보정',
      value: formatDecimal(metrics.ece),
      detail: '실제와의 차이',
      icon: ShieldCheck,
      tone: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    },
    {
      label: '평가 반영률',
      value: formatPercent(metrics.coverage),
      detail: '보류 제외 비율',
      icon: BarChart3,
      tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    },
    {
      label: '평가 대기율',
      value: formatPercent(metrics.abstainRate),
      detail: '데이터 부족 제외',
      icon: Waves,
      tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
    {
      label: '평가 표본',
      value: metrics.nScored > 0 ? metrics.nScored.toLocaleString('ko-KR') : '--',
      detail: `최근 ${metrics.metricDays}일`,
      icon: CalendarDays,
      tone: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
    },
  ]

  return (
    <motion.section
      {...FADE_UP}
      transition={{ duration: 0.5, delay: 0.29 }}
      className="mb-12"
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1">최근 90일 검증 결과</h2>
        <p className="text-sm text-slate-400">{buildStatusText(metrics)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tiles.map(({ label, value, detail, icon: Icon, tone }) => (
          <GlassCard key={label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tone}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] leading-tight break-keep text-slate-500">{label}</p>
                <p className="text-lg font-semibold text-white tabular-nums">{value}</p>
                <p className="text-[11px] leading-tight break-keep text-slate-500">{detail}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          현재 사용 중인 전망 모델 {metrics.championModelVersion ?? '준비 중'}의 실제 결과를
          {metrics.sinceDate}부터 {metrics.throughDate}까지 집계했습니다.
        </p>
      </div>
    </motion.section>
  )
}

function buildStatusText(metrics: MethodologyMetricsSummary) {
  if (metrics.status === 'ready') {
    return `${metrics.latestMetricDate ?? metrics.throughDate} 기준으로 자동 업데이트됩니다`
  }

  if (metrics.status === 'empty') {
    return '검증 데이터가 쌓이면 이곳에 자동으로 표시됩니다'
  }

  return '지금은 검증 결과를 불러올 수 없습니다'
}

function formatPercent(value: number | null) {
  return value === null ? '--' : `${(value * 100).toFixed(1)}%`
}

function formatDecimal(value: number | null) {
  return value === null ? '--' : value.toFixed(3)
}
