/** 유사 패턴 리스트 — 요약 통계 + 키보드 탐색 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import type { ComparisonResult } from '@/lib/tli/types'
import useRovingTabindex from '../../_hooks/use-roving-tabindex'
import ComparisonCard from './comparison-card'
import ComparisonEmpty from './empty-state'

interface ComparisonListProps {
  comparisons: ComparisonResult[]
  selectedComparisonIds?: string[]
  onToggleComparison?: (comparisonId: string) => void
  /** 정점 이전 단계(Emerging/Growth)인지 — false면 "정점까지 X일" 숨김 */
  isPrePeak?: boolean
}

function ComparisonList({
  comparisons,
  selectedComparisonIds = [],
  onToggleComparison,
  isPrePeak = true,
}: ComparisonListProps) {
  const { containerRef, handleKeyDown } = useRovingTabindex()
  const selectedCount = selectedComparisonIds.length
  const selectedLineIndexById = useMemo(() => {
    const selectedSet = new Set(selectedComparisonIds)
    const selectedComparisons = comparisons.filter((comparison) => selectedSet.has(comparison.pastThemeId))
    return new Map(selectedComparisons.map((comparison, index) => [comparison.pastThemeId, index]))
  }, [comparisons, selectedComparisonIds])

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
            <h2 className="text-lg font-bold">
              <span className="text-white">유사</span>
              <span className="text-emerald-400 ml-1">패턴</span>
            </h2>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <span className="text-xs font-mono text-sky-300 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 tabular-nums">
                  선택 {selectedCount}
                </span>
              )}
              {comparisons.length > 0 && (
                <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 tabular-nums">
                  전체 {comparisons.length}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs font-mono text-slate-500 mt-1">
            {selectedCount > 0
              ? '선택한 패턴은 왼쪽 점수 추이 그래프에 바로 반영됩니다.'
              : '카드를 고르면 점수 추이 그래프에 비교선이 추가됩니다.'}
          </p>
        </div>

        {comparisons.length === 0 ? (
          <ComparisonEmpty />
        ) : (
          <div
            ref={containerRef}
            role="group"
            aria-label="유사 패턴 목록"
            onKeyDown={handleKeyDown}
            className="flex-1 overflow-y-auto custom-scroll px-4 py-3 space-y-3"
          >
            {comparisons.map((comp, idx) => (
              <ComparisonCard
                key={comp.pastThemeId}
                comp={comp}
                idx={idx}
                isSelected={selectedComparisonIds.includes(comp.pastThemeId)}
                selectedLineIndex={selectedLineIndexById.get(comp.pastThemeId) ?? null}
                onToggle={() => onToggleComparison?.(comp.pastThemeId)}
                isPrePeak={isPrePeak}
              />
            ))}
          </div>
        )}
      </motion.div>
    </GlassCard>
  )
}

export default ComparisonList
