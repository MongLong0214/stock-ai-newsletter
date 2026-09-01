/** 자동 비교 후보 카드 */
'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ComparisonResult } from '@/lib/tli/types'
import { COMPARISON_COLORS } from '@/lib/tli/constants/comparison-colors'

interface ComparisonCardProps {
  comp: ComparisonResult
  idx: number
  isSelected: boolean
  isFallback: boolean
  selectedLineIndex?: number | null
  onToggle: () => void
}

export default function ComparisonCard({
  comp,
  idx,
  isSelected,
  isFallback,
  selectedLineIndex = null,
  onToggle,
}: ComparisonCardProps) {
  const selectedLineColor = selectedLineIndex != null
    ? COMPARISON_COLORS[selectedLineIndex % COMPARISON_COLORS.length]
    : null
  const isCompleted = comp.comparisonLane === 'completed_analog'
  const laneLabel = isCompleted
    ? '완결 관측 후보'
    : isFallback
      ? '진행 중 관측 후보 · 대체 표시'
      : '진행 중 관측 후보'
  const laneClass = isCompleted
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : 'bg-sky-500/10 text-sky-300 border-sky-500/20'

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: idx * 0.04 }}
      role="button"
      data-roving-item="true"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${comp.pastTheme} 데이터를 ${isSelected ? '나란히 보기에서 제거' : '나란히 보기'}`}
      className={cn(
        'w-full space-y-4 rounded-xl border p-5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        isSelected
          ? 'bg-slate-800 border-emerald-500/55 shadow-[0_0_0_1px_rgba(16,185,129,0.14),0_10px_40px_rgba(16,185,129,0.08)]'
          : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-600/50',
      )}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onToggle()
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-snug text-white">{comp.pastTheme}</h3>
            {isSelected && selectedLineColor && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-900/80 px-2 py-0.5 text-[10px] font-mono text-slate-200">
                <span
                  className="h-1.5 w-4 rounded-full"
                  style={{ backgroundColor: selectedLineColor }}
                  aria-hidden="true"
                />
                나란히 보는 중
              </span>
            )}
          </div>
          <span className={cn(
            'mt-2 inline-block rounded border px-2 py-0.5 text-[11px] font-mono',
            laneClass,
          )}>
            {laneLabel}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-2 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5 text-[11px] font-mono sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-slate-500">선정 방식</dt>
          <dd className="mt-1 truncate text-slate-300">{comp.retrievalSurface}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-500">생성 버전</dt>
          <dd className="mt-1 truncate text-slate-300">{comp.generationVersion ?? '확인 불가'}</dd>
        </div>
      </dl>

      <div className={cn(
        'flex items-center justify-between gap-3 border-t pt-3 text-[11px] font-mono',
        isSelected ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-800/70 text-slate-500',
      )}>
        <span>{isSelected ? '선택한 데이터가 차트에 표시되고 있습니다' : '선택하면 차트에 데이터를 함께 표시합니다'}</span>
        <span className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 transition-colors',
          isSelected
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
            : 'border-slate-700/60 text-slate-300',
        )}>
          {isSelected ? '나란히 보기 해제' : '데이터 나란히 보기'}
        </span>
      </div>
    </motion.div>
  )
}
