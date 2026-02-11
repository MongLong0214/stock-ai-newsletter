/** 유사 패턴 리스트 — 품질 필터 + 요약 통계 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import type { ComparisonResult } from '@/lib/tli/types'
import ComparisonCard from './comparison-card'

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
  // 품질 필터 + 원본 인덱스 유지 (차트 오버레이 연동)
  const validEntries = useMemo(
    () => comparisons
      .map((comp, originalIdx) => ({ comp, originalIdx }))
      .filter(({ comp }) => comp.pastTotalDays >= MIN_PAST_TOTAL_DAYS),
    [comparisons],
  )

  if (validEntries.length === 0) {
    return (
      <GlassCard className="p-6 h-full flex items-center justify-center">
        <p className="text-sm font-mono text-slate-500 text-center">
          신뢰도 높은 비교 테마가 없습니다.
        </p>
      </GlassCard>
    )
  }

  const avgSim = Math.round(
    validEntries.reduce((sum, { comp }) => sum + comp.similarity, 0) / validEntries.length * 100,
  )

  return (
    <GlassCard className="p-6 h-full overflow-y-auto custom-scroll">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <h2 className="text-lg font-bold mb-1">
          <span className="text-white">유사</span>
          <span className="text-emerald-400 ml-1">패턴</span>
        </h2>
        <p className="text-xs font-mono text-slate-500 mb-4">
          {validEntries.length}개 과거 테마 비교 · 평균 유사도 {avgSim}%
        </p>

        <div className="space-y-3">
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