'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Comparison {
  pastTheme: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  message: string
}

interface ComparisonListProps {
  comparisons: Comparison[]
  /** 선택된 비교 테마 인덱스 배열 */
  selectedIndices?: number[]
  /** 비교 곡선 토글 콜백 */
  onToggleComparison?: (index: number) => void
}

/** 유사도에 따른 색상 */
function getSimilarityColor(similarity: number): string {
  if (similarity >= 0.8) return '#10B981'
  if (similarity >= 0.6) return '#0EA5E9'
  if (similarity >= 0.4) return '#F59E0B'
  return '#64748B'
}

/** 유사 패턴 리스트 컴포넌트 */
function ComparisonList({
  comparisons,
  selectedIndices = [],
  onToggleComparison,
}: ComparisonListProps) {
  if (comparisons.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6"
    >
      <h2 className="text-lg font-bold mb-4">
        <span className="text-white">유사</span>
        <span className="text-emerald-400 ml-1">패턴</span>
      </h2>

      <div className="space-y-3">
        {comparisons.map((comp, idx) => {
          const isSelected = selectedIndices.includes(idx)
          const simColor = getSimilarityColor(comp.similarity)
          const simPercent = Math.round(comp.similarity * 100)
          // 현재 위치가 과거 전체 주기 대비 %
          const progressPercent = comp.pastTotalDays > 0
            ? Math.min((comp.currentDay / comp.pastTotalDays) * 100, 100)
            : 0
          // 피크 위치
          const peakPercent = comp.pastTotalDays > 0
            ? Math.min((comp.pastPeakDay / comp.pastTotalDays) * 100, 100)
            : 0

          return (
            <motion.div
              key={idx}
              layout
              className={cn(
                'p-4 rounded-lg border transition-all cursor-pointer',
                isSelected
                  ? 'bg-slate-800/70 border-emerald-500/40'
                  : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600/50'
              )}
              onClick={() => onToggleComparison?.(idx)}
            >
              {/* 상단: 테마명 + 유사도 + 토글 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-white">{comp.pastTheme}</span>
                <span
                  className="text-xs font-mono font-medium px-2 py-0.5 rounded-full"
                  style={{
                    color: simColor,
                    backgroundColor: `${simColor}15`,
                    border: `1px solid ${simColor}30`,
                  }}
                >
                  {simPercent}%
                </span>
              </div>

              {/* 유사도 바 */}
              <div className="relative h-1.5 rounded-full bg-slate-700/40 overflow-hidden mb-3">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: simColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${simPercent}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.1 }}
                />
              </div>

              {/* 미니 타임라인 */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
                  <span>D+0</span>
                  <span>피크 D+{comp.pastPeakDay}</span>
                  <span>D+{comp.pastTotalDays}</span>
                </div>
                <div className="relative h-2 rounded-full bg-slate-700/30">
                  {/* 피크 마커 */}
                  <div
                    className="absolute top-0 h-2 w-0.5 bg-amber-500/60"
                    style={{ left: `${peakPercent}%` }}
                  />
                  {/* 현재 위치 */}
                  <motion.div
                    className="absolute top-0 h-2 rounded-full bg-emerald-500/30"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                  />
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900"
                    style={{ left: `${progressPercent}%`, marginLeft: '-5px' }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.5 + idx * 0.1 }}
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-1">
                  현재 D+{comp.currentDay} / 전체 주기 {comp.pastTotalDays}일
                </div>
              </div>

              {/* 메시지 */}
              <p className="text-xs text-slate-400 leading-relaxed">{comp.message}</p>

              {/* 예상 피크 */}
              {comp.estimatedDaysToPeak > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-amber-400 font-mono">
                    예상 피크까지 ~{comp.estimatedDaysToPeak}일
                  </span>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

export default ComparisonList
