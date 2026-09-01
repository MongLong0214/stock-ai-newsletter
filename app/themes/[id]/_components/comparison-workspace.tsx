'use client'

import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import LifecycleCurve from '@/components/tli/lifecycle-curve'
import { cn } from '@/lib/utils'

const WORKSPACE_HEIGHT_CLASS = 'h-[560px] sm:h-[620px] xl:h-[clamp(620px,72vh,720px)]'

interface ComparisonWorkspaceProps {
  themeName: string
  currentData: Array<{ date: string; score: number }>
  newsTimeline?: Array<{ date: string; count: number }>
  interestTimeline?: Array<{ date: string; value: number }>
  shouldReduceMotion?: boolean
}

function ComparisonWorkspace({
  themeName,
  currentData,
  newsTimeline,
  interestTimeline,
  shouldReduceMotion = false,
}: ComparisonWorkspaceProps) {
  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08 }}
      className={cn(WORKSPACE_HEIGHT_CLASS, 'mb-6 sm:mb-8')}
    >
      <GlassCard className="h-full overflow-hidden grid grid-rows-[auto_minmax(0,1fr)]">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h2 className="text-lg font-bold">
                <span className="text-white">점수</span>
                <span className="text-emerald-400 ml-1">추이</span>
              </h2>
              <SummaryPill label="기준선" value="1개" />
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-400 break-keep">
              {themeName} 테마의 생애주기 점수 흐름을 확인합니다.
            </p>
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6 min-h-0">
          <div className="h-full min-h-0 rounded-[24px] border border-slate-800/70 bg-[linear-gradient(180deg,rgba(2,6,23,0.56),rgba(2,6,23,0.18))] p-3 sm:p-4 grid grid-rows-[auto_minmax(0,1fr)]">
            <div className="flex flex-wrap items-center gap-2 pb-3">
              {newsTimeline && newsTimeline.length > 0 && (
                <ChartSignalTag label="뉴스량" color="#0EA5E9" />
              )}
              {interestTimeline && interestTimeline.length > 0 && (
                <ChartSignalTag label="관심도" color="#8B5CF6" dashed />
              )}
              <ChartSignalTag label="현재 최고점" color="#F59E0B" dashed />
            </div>

            <div className="min-h-0">
              <LifecycleCurve
                currentData={currentData}
                currentLabel={`${themeName} (현재)`}
                newsTimeline={newsTimeline}
                interestTimeline={interestTimeline}
                height="100%"
              />
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

function SummaryPill({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-mono tabular-nums text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <span className="text-slate-500">{label}</span>
      <span className="ml-1 text-white">{value}</span>
    </div>
  )
}

function ChartSignalTag({
  label,
  color,
  dashed = false,
}: {
  label: string
  color: string
  dashed?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-950/70 px-2.5 py-1 text-[11px] font-mono text-slate-400">
      <span
        className={cn('h-0.5 w-6 rounded-full', dashed && 'border-t border-dashed bg-transparent')}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </div>
  )
}

export default ComparisonWorkspace
