/** 유사 패턴 리스트 — 메인 컨테이너 */
'use client'

import { motion } from 'framer-motion'
import { GlassCard } from '@/components/tli/glass-card'
import type { ComparisonResult } from '@/lib/tli/types'
import ComparisonCard from './comparison-card'

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
  if (comparisons.length === 0) return null

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
          {comparisons.length}개 과거 테마와 비교 분석
        </p>

        <div className="space-y-3">
          {comparisons.map((comp, idx) => (
            <ComparisonCard
              key={comp.pastTheme}
              comp={comp}
              idx={idx}
              isSelected={selectedIndices.includes(idx)}
              onToggle={() => onToggleComparison?.(idx)}
            />
          ))}
        </div>
      </motion.div>
    </GlassCard>
  )
}

export default ComparisonList
