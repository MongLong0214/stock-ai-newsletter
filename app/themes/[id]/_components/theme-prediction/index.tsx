'use client'

import { motion } from 'framer-motion'
import { Activity, Gauge, ShieldAlert, Target } from 'lucide-react'
import { GlassCard } from '@/components/tli/glass-card'
import { useGetThemePrediction } from '../../_services/use-get-theme-prediction'
import { formatPredictionSnapshotCard, getPredictionSnapshotForPresentation } from './presentation'

const containerEase = [0.25, 0.46, 0.45, 0.94] as const

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: containerEase },
  },
}

function ThemePrediction({ themeId, stageKo, change7d }: {
  readonly themeId: string
  readonly stageKo: string
  readonly change7d: number
}) {
  const { data: snapshot, isLoading, isError } = useGetThemePrediction(themeId)
  const presentationSnapshot = getPredictionSnapshotForPresentation(snapshot, { isLoading, isError })
  const view = formatPredictionSnapshotCard(presentationSnapshot, { stageKo, change7d })
  const isFallback = 'stageLabel' in view
  const statusTone = isFallback
    ? 'border-slate-700/30 bg-slate-800/30 text-slate-300'
    : snapshot?.abstain
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  const phaseTone = snapshot?.phase === 'hot'
    ? 'text-orange-300'
    : snapshot?.phase === 'cooling'
      ? 'text-slate-300'
      : snapshot?.phase === 'rising'
        ? 'text-emerald-300'
        : 'text-slate-400'

  return (
    <GlassCard className="p-5 sm:p-6">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            <span className="text-white">테마</span>
            <span className="text-emerald-400 ml-1">전망</span>
          </h2>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono leading-tight break-keep ${statusTone}`}>
            {isLoading ? '전망 확인 중' : view.statusLabel}
          </span>
        </div>

        <div className={`grid grid-cols-1 gap-3 ${isFallback ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          {isFallback ? (
            <>
              <SnapshotStat
                icon={<Gauge className="h-4 w-4" />}
                label="현재 단계"
                value={view.stageLabel}
                tone="sky"
              />
              <SnapshotStat
                icon={<Activity className="h-4 w-4" />}
                label="관심도 방향"
                value={view.directionLabel}
                tone="slate"
                valueClassName={change7d > 0 ? 'text-emerald-300' : change7d < 0 ? 'text-red-300' : 'text-slate-300'}
              />
            </>
          ) : (
            <>
              <SnapshotStat
                icon={<Target className="h-4 w-4" />}
                label={view.statusLabel}
                value={isError ? '오류' : view.probabilityLabel}
                tone="emerald"
              />
              <SnapshotStat
                icon={<Gauge className="h-4 w-4" />}
                label="예상 범위"
                value={isError ? '재시도 필요' : view.ciLabel}
                tone="sky"
              />
              <SnapshotStat
                icon={<Activity className="h-4 w-4" />}
                label="현재 방향"
                value={view.phaseLabel}
                tone="slate"
                valueClassName={phaseTone}
              />
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-700/30 bg-slate-800/30 p-4 font-mono">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="space-y-1">
              {isFallback ? (
                <p className="text-[10px] text-amber-300">{view.guidanceLabel}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-200">{view.trailingPrecisionLabel}</p>
                  {view.reasonLabel && (
                    <p className="text-[10px] text-amber-300">아직 표시하지 않는 이유: {view.reasonLabel}</p>
                  )}
                  {snapshot?.modelVersion && (
                    <p className="text-[10px] text-slate-500">
                      기준일 {snapshot.predictionDate} · 사용 모델 {snapshot.modelVersion}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <p className="pt-1 text-center font-mono text-[10px] text-slate-500">
          이 전망은 관심도 흐름을 해석한 참고 정보입니다
          <br />
          매수·매도 판단의 근거로 사용하지 마세요
        </p>
      </motion.div>
    </GlassCard>
  )
}

interface SnapshotStatProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly value: string
  readonly tone: 'emerald' | 'sky' | 'slate'
  readonly valueClassName?: string
}

const TONE_STYLES: Record<SnapshotStatProps['tone'], { readonly border: string; readonly bg: string; readonly text: string }> = {
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-300' },
  sky: { border: 'border-sky-500/20', bg: 'bg-sky-500/5', text: 'text-sky-300' },
  slate: { border: 'border-slate-700/30', bg: 'bg-slate-800/30', text: 'text-slate-300' },
}

function SnapshotStat({ icon, label, value, tone, valueClassName }: SnapshotStatProps) {
  const style = TONE_STYLES[tone]
  return (
    <div className={`min-w-0 rounded-xl border p-3.5 font-mono ${style.border} ${style.bg}`}>
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className={`shrink-0 ${style.text}`}>{icon}</span>
        <span className="min-w-0 text-[10px] leading-tight break-keep text-slate-500">{label}</span>
      </div>
      <div className={`text-lg font-bold leading-tight break-keep ${valueClassName ?? style.text}`}>{value}</div>
    </div>
  )
}

export default ThemePrediction
