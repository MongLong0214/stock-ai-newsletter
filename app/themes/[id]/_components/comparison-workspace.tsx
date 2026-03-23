'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, X } from 'lucide-react'
import { GlassCard } from '@/components/tli/glass-card'
import LifecycleCurve from '@/components/tli/lifecycle-curve'
import { COMPARISON_COLORS } from '@/lib/tli/constants/comparison-colors'
import { cn } from '@/lib/utils'
import type { ComparisonResult } from '@/lib/tli/types'
import ComparisonList from './comparison-list'

const WORKSPACE_HEIGHT_CLASS = 'xl:h-[clamp(680px,78vh,780px)]'

interface ComparisonWorkspaceProps {
  themeName: string
  currentData: Array<{ date: string; score: number }>
  comparisons: ComparisonResult[]
  selectedComparisonIds: string[]
  onToggleComparison: (comparisonId: string) => void
  onClearComparisons: () => void
  onRemoveComparison: (comparisonId: string) => void
  newsTimeline?: Array<{ date: string; count: number }>
  interestTimeline?: Array<{ date: string; value: number }>
  isPrePeak: boolean
  shouldReduceMotion?: boolean
}

function ComparisonWorkspace({
  themeName,
  currentData,
  comparisons,
  selectedComparisonIds,
  onToggleComparison,
  onClearComparisons,
  onRemoveComparison,
  newsTimeline,
  interestTimeline,
  isPrePeak,
  shouldReduceMotion = false,
}: ComparisonWorkspaceProps) {
  const selectedComparisons = useMemo(() => {
    if (selectedComparisonIds.length === 0) return []

    const selectedIdSet = new Set(selectedComparisonIds)
    return comparisons.filter((comparison) => selectedIdSet.has(comparison.pastThemeId))
  }, [comparisons, selectedComparisonIds])

  const selectedSeries = useMemo(() => (
    selectedComparisons.map((comparison, index) => ({
      comparison,
      color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
      order: index + 1,
    }))
  ), [selectedComparisons])

  const comparisonData = useMemo(() => {
    if (selectedSeries.length === 0) return undefined

    return selectedSeries.map(({ comparison }) => ({
      themeName: comparison.pastTheme,
      data: comparison.lifecycleCurve.map((point, dayIdx) => ({
        day: dayIdx,
        value: point.score,
      })),
      similarity: comparison.similarity,
    }))
  }, [selectedSeries])

  const supportMetricsLabel = useMemo(() => {
    const parts: string[] = []
    if (newsTimeline?.length) parts.push('뉴스')
    if (interestTimeline?.length) parts.push('관심도')
    return parts.length > 0 ? parts.join(' · ') : '없음'
  }, [newsTimeline, interestTimeline])

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.55fr)] gap-4 sm:gap-6 mb-6 sm:mb-8 items-start">
      <div
        className={cn(WORKSPACE_HEIGHT_CLASS, 'xl:sticky xl:top-24')}
      >
        <ComparisonList
          comparisons={comparisons}
          selectedComparisonIds={selectedComparisonIds}
          onToggleComparison={onToggleComparison}
          isPrePeak={isPrePeak}
        />
      </div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className={WORKSPACE_HEIGHT_CLASS}
      >
        <GlassCard className="h-full overflow-hidden grid grid-rows-[auto_auto_minmax(0,1fr)]">
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h2 className="text-lg font-bold">
                  <span className="text-white">점수 추이</span>
                  <span className="text-emerald-400 ml-1">비교</span>
                </h2>
                <div className="flex items-center gap-2">
                  <SummaryPill label="기준선" value="1개" accent="emerald" />
                  <SummaryPill label="비교선" value={`${selectedSeries.length}개`} accent="sky" />
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                현재 테마 흐름과 선택한 유사 패턴을 같은 축에서 바로 비교합니다.
              </p>
            </div>
          </div>

          <div className="px-4 pb-4 sm:px-6 sm:pb-5">
            <div className="rounded-[22px] border border-slate-800/70 bg-slate-950/55 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-slate-500">현재 표시 중인 선</p>
                <p className="mt-1 text-xs text-slate-400">
                  색상과 이름이 차트 선과 1:1로 연결됩니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SignalPill icon={<BarChart3 className="h-3.5 w-3.5" />} label="보조 지표" value={supportMetricsLabel} />
                {selectedSeries.length > 0 && (
                  <button
                    type="button"
                      onClick={onClearComparisons}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[11px] font-mono text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      모두 해제
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-stretch gap-2.5 overflow-x-auto custom-scroll pb-1 pr-1">
                <SeriesToken
                  title={themeName}
                  subtitle="현재 테마 기준선"
                  color="#10B981"
                  valueLabel="상태"
                  value="활성"
                  accent="emerald"
                />

                {selectedSeries.length > 0 ? (
                  selectedSeries.map(({ comparison, color, order }) => (
                    <SeriesToken
                      key={comparison.pastThemeId}
                      title={comparison.pastTheme}
                      subtitle={comparison.comparisonLane === 'completed_analog' ? `비교선 ${String(order).padStart(2, '0')} · 완결 아날로그` : `비교선 ${String(order).padStart(2, '0')} · 활성 피어`}
                      color={color}
                      valueLabel="유사도"
                      value={`${Math.round(comparison.similarity * 100)}%`}
                      accent="slate"
                      onRemove={() => onRemoveComparison(comparison.pastThemeId)}
                    />
                  ))
                ) : (
                  <div className="flex min-h-[86px] min-w-[260px] flex-1 items-center rounded-[18px] border border-dashed border-slate-700/70 bg-black/20 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">비교선이 아직 선택되지 않았어요</p>
                      <p className="mt-1 text-xs text-slate-400">
                        오른쪽 유사 패턴 카드에서 비교할 패턴을 고르면 차트가 즉시 갱신됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
                  comparisonData={comparisonData}
                  newsTimeline={newsTimeline}
                  interestTimeline={interestTimeline}
                  height="100%"
                />
              </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}

function SummaryPill({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'emerald' | 'sky'
}) {
  return (
    <div className={cn(
      'rounded-full border px-2 py-0.5 text-xs font-mono tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]',
      accent === 'emerald'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
        : 'border-sky-500/20 bg-sky-500/10 text-sky-200',
    )}>
      <span className="text-slate-500">{label}</span>
      <span className="ml-1 text-white">{value}</span>
    </div>
  )
}

function SignalPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-[11px] font-mono text-slate-300">
      <span className="text-slate-400">{icon}</span>
      <span>{label}</span>
      <span className="text-slate-500">·</span>
      <span className="text-white">{value}</span>
    </div>
  )
}

function SeriesToken({
  title,
  subtitle,
  color,
  valueLabel,
  value,
  accent,
  onRemove,
}: {
  title: string
  subtitle: string
  color: string
  valueLabel: string
  value: string
  accent: 'emerald' | 'slate'
  onRemove?: () => void
}) {
  return (
    <div className={cn(
      'min-w-[220px] rounded-[18px] border px-3.5 py-3 shadow-[0_10px_24px_rgba(2,6,23,0.18)]',
      accent === 'emerald'
        ? 'border-emerald-500/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(2,6,23,0.82))]'
        : 'border-slate-700/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.82))]',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/15 px-2.5 py-1">
            <span className="h-2 w-7 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] font-mono text-slate-200">표시 중</span>
          </div>
          <p className="mt-2.5 truncate text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${title} 비교선 제거`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-black/15 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-500">{valueLabel}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
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
