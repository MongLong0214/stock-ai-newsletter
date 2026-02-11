/** 유사 패턴 리스트 — 품질 필터 + 요약 통계 + 키보드 탐색 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import type { ComparisonResult } from '@/lib/tli/types'
import useRovingTabindex from '../../_hooks/use-roving-tabindex'
import ComparisonCard from './comparison-card'
import ComparisonEmpty from './empty-state'
import { generateInsight } from './insight'

// 과거 주기 14일 미만은 비교 신뢰도 부족 (파이프라인 필터와 동일)
const MIN_PAST_TOTAL_DAYS = 14

interface ComparisonListProps {
  comparisons: ComparisonResult[]
  selectedIndices?: number[]
  onToggleComparison?: (index: number) => void
}

function ComparisonList({
  comparisons,
  selectedIndices = [],
  onToggleComparison,
}: ComparisonListProps) {
  const { containerRef, handleKeyDown } = useRovingTabindex()

  // 품질 필터 + 원본 인덱스 유지 (차트 오버레이 연동)
  const validEntries = useMemo(
    () => comparisons
      .map((comp, originalIdx) => ({ comp, originalIdx }))
      .filter(({ comp }) => comp.pastTotalDays >= MIN_PAST_TOTAL_DAYS && comp.pastPeakDay >= 3),
    [comparisons],
  )

  if (validEntries.length === 0) {
    return <ComparisonEmpty hasRawData={comparisons.length > 0} />
  }

  const insight = generateInsight(validEntries.map(e => e.comp))

  return (
    <GlassCard className="h-full overflow-hidden flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex flex-col h-full"
      >
        <div className="px-4 py-3.5 border-b border-slate-800/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">
              <span className="text-white">유사</span>
              <span className="text-emerald-400 ml-1">패턴</span>
            </h2>
            <span className="text-xs font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 tabular-nums">
              {validEntries.length}
            </span>
          </div>
          {insight && (
            <p className="text-xs font-mono text-slate-500 mt-1">{insight}</p>
          )}
        </div>

        {/* role="listbox" + roving tabindex로 키보드 탐색 지원 */}
        <div
          ref={containerRef}
          role="group"
          aria-label="유사 패턴 목록"
          onKeyDown={handleKeyDown}
          className="flex-1 overflow-y-auto custom-scroll px-4 py-3 space-y-3"
        >
          {validEntries.map(({ comp, originalIdx }, displayIdx) => (
            <ComparisonCard
              key={comp.pastThemeId}
              comp={comp}
              idx={displayIdx}
              isSelected={selectedIndices.includes(originalIdx)}
              onToggle={() => onToggleComparison?.(originalIdx)}
            />
          ))}
        </div>
      </motion.div>
    </GlassCard>
  )
}

export default ComparisonList