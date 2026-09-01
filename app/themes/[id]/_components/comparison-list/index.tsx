/** 자동 비교 후보 리스트 — lane 분리 + 키보드 탐색 */
'use client'

import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import type { ComparisonResult } from '@/lib/tli/types'
import useRovingTabindex from '../../_hooks/use-roving-tabindex'
import ComparisonCard from './comparison-card'
import ComparisonEmpty from './empty-state'

interface ComparisonListProps {
  comparisons: ComparisonResult[]
  comparisonSource: 'analog' | 'v2_active_peer' | 'none'
  comparisonGenerationVersion: string | null
  selectedComparisonIds?: string[]
  onToggleComparison?: (comparisonId: string) => void
}

function ComparisonList({
  comparisons,
  comparisonSource,
  comparisonGenerationVersion,
  selectedComparisonIds = [],
  onToggleComparison,
}: ComparisonListProps) {
  const { containerRef, handleKeyDown } = useRovingTabindex()
  const selectedCount = selectedComparisonIds.length
  const completedComparisons = useMemo(() => comparisons
    .filter((comparison) => comparison.comparisonLane === 'completed_analog')
    .sort((left, right) => left.pastTheme.localeCompare(right.pastTheme, 'ko'))
    .slice(0, 5), [comparisons])
  const activePeerComparisons = useMemo(() => comparisons
    .filter((comparison) => comparison.comparisonLane === 'active_peer')
    .sort((left, right) => left.pastTheme.localeCompare(right.pastTheme, 'ko'))
    .slice(0, Math.max(0, 5 - completedComparisons.length)), [comparisons, completedComparisons.length])
  const orderedComparisons = useMemo(
    () => [...completedComparisons, ...activePeerComparisons],
    [activePeerComparisons, completedComparisons],
  )
  const selectedLineIndexById = useMemo(() => {
    const selectedSet = new Set(selectedComparisonIds)
    const selectedComparisons = orderedComparisons.filter((comparison) => selectedSet.has(comparison.pastThemeId))
    return new Map(selectedComparisons.map((comparison, index) => [comparison.pastThemeId, index]))
  }, [orderedComparisons, selectedComparisonIds])

  return (
    <GlassCard className="h-full overflow-hidden flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex flex-col h-full"
      >
        <div className="px-4 py-3.5 border-b border-slate-800/50">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">자동 비교 후보</h2>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <span className="text-xs font-mono text-sky-300 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 tabular-nums">
                  선택 {selectedCount}
                </span>
              )}
              {orderedComparisons.length > 0 && (
                <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 tabular-nums">
                  표시 {orderedComparisons.length}
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 break-keep">
            복수의 수치 기반 검색 방식이 자동으로 추출한 대상입니다. 업종·사업 연관성, 의미적 유사성,
            향후 흐름 또는 투자 성과를 검증한 결과가 아닙니다.
          </p>
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            이름순으로 최대 5개 자동 후보를 표시합니다.
            {comparisonGenerationVersion ? ` · 생성 버전 ${comparisonGenerationVersion}` : ''}
          </p>
        </div>

        {comparisons.length === 0 ? (
          <ComparisonEmpty />
        ) : (
          <div
            ref={containerRef}
            role="group"
            aria-label="자동 비교 후보 목록"
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-auto custom-scroll px-4 py-3 space-y-5"
          >
            {completedComparisons.length > 0 && (
              <section className="space-y-3" aria-label="완결 관측 후보">
                <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300">
                  완결 관측 후보
                </span>
                {completedComparisons.map((comp, idx) => (
                  <ComparisonCard
                    key={comp.pastThemeId}
                    comp={comp}
                    idx={idx}
                    isSelected={selectedComparisonIds.includes(comp.pastThemeId)}
                    isFallback={false}
                    selectedLineIndex={selectedLineIndexById.get(comp.pastThemeId) ?? null}
                    onToggle={() => onToggleComparison?.(comp.pastThemeId)}
                  />
                ))}
              </section>
            )}

            {activePeerComparisons.length > 0 && (
              <section className="space-y-3" aria-label="진행 중 관측 후보">
                {comparisonSource === 'v2_active_peer' && (
                  <p className="text-xs leading-relaxed text-sky-200 break-keep">
                    완결 비교선이 없어 진행 중 관측 후보를 대신 표시합니다
                  </p>
                )}
                <span className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-mono text-sky-300">
                  {comparisonSource === 'v2_active_peer'
                    ? '진행 중 관측 후보 · 대체 표시'
                    : '진행 중 관측 후보'}
                </span>
                {activePeerComparisons.map((comp, idx) => (
                  <ComparisonCard
                    key={comp.pastThemeId}
                    comp={comp}
                    idx={completedComparisons.length + idx}
                    isSelected={selectedComparisonIds.includes(comp.pastThemeId)}
                    isFallback={comparisonSource === 'v2_active_peer'}
                    selectedLineIndex={selectedLineIndexById.get(comp.pastThemeId) ?? null}
                    onToggle={() => onToggleComparison?.(comp.pastThemeId)}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </motion.div>
    </GlassCard>
  )
}

export default ComparisonList
