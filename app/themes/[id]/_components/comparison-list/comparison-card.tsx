/** 개별 비교 테마 카드 */
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ComparisonResult } from '@/lib/tli/types'
import PillarBars, { getSimilarityColor, getSimilarityBadge } from './pillar-bars'

interface ComparisonCardProps {
  comp: ComparisonResult
  idx: number
  isSelected: boolean
  onToggle: () => void
}

export default function ComparisonCard({ comp, idx, isSelected, onToggle }: ComparisonCardProps) {
  const simColor = getSimilarityColor(comp.similarity)
  const simPercent = Math.round(comp.similarity * 100)
  const badge = getSimilarityBadge(comp.similarity)

  const progressPercent = comp.pastTotalDays > 0
    ? Math.min((comp.currentDay / comp.pastTotalDays) * 100, 100)
    : 0
  const peakPercent = comp.pastTotalDays > 0
    ? Math.min((comp.pastPeakDay / comp.pastTotalDays) * 100, 100)
    : 0

  const messageParts = useMemo(() => comp.message.split('. ').filter(Boolean), [comp.message])

  return (
    <motion.div
      key={comp.pastTheme}
      layout
      className={cn(
        'p-4 rounded-lg border transition-all cursor-pointer',
        isSelected
          ? 'bg-slate-800/70 border-emerald-500/40'
          : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600/50'
      )}
      onClick={onToggle}
    >
      {/* 상단: 테마명 + 뱃지 */}
      <div className="mb-3">
        <span className="text-sm font-medium text-white block mb-1.5">{comp.pastTheme}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
            {badge.label}
          </span>
          <span
            className="text-xs font-mono font-medium px-2 py-0.5 rounded-full"
            style={{ color: simColor, backgroundColor: `${simColor}15`, border: `1px solid ${simColor}30` }}
          >
            {simPercent}%
          </span>
        </div>
      </div>

      {/* 3-Pillar 유사도 */}
      <PillarBars
        featureSim={comp.featureSim}
        curveSim={comp.curveSim}
        keywordSim={comp.keywordSim}
        similarity={comp.similarity}
        idx={idx}
      />

      {/* 미니 타임라인 */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-1">
          <span>D+0</span>
          <span>피크 D+{comp.pastPeakDay}</span>
          <span>D+{comp.pastTotalDays}</span>
        </div>
        <div className="relative h-2 rounded-full bg-slate-700/30">
          <div className="absolute top-0 h-2 w-0.5 bg-amber-500/60" style={{ left: `${peakPercent}%` }} />
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

      {/* 유사 근거 + 위치 분석 */}
      <div className="space-y-1">
        {messageParts[0] && <p className="text-[11px] font-mono text-slate-400">{messageParts[0]}.</p>}
        {messageParts[1] && <p className="text-xs text-slate-300">{messageParts[1]}{messageParts[1].endsWith('.') ? '' : '.'}</p>}
      </div>

      {/* 과거 테마 결과 */}
      {comp.pastPeakScore !== null && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="px-2 py-1 rounded bg-slate-800/80 text-center">
            <div className="text-[10px] font-mono text-slate-500">피크 점수</div>
            <div className="text-xs font-mono text-white font-medium">{comp.pastPeakScore}</div>
          </div>
          {comp.pastDeclineDays !== null && (
            <div className="px-2 py-1 rounded bg-slate-800/80 text-center">
              <div className="text-[10px] font-mono text-slate-500">하락 기간</div>
              <div className="text-xs font-mono text-white font-medium">{comp.pastDeclineDays}일</div>
            </div>
          )}
          {comp.pastFinalStage && (
            <div className="px-2 py-1 rounded bg-slate-800/80 text-center">
              <div className="text-[10px] font-mono text-slate-500">최종 상태</div>
              <div className="text-xs font-mono text-slate-400">{comp.pastFinalStage}</div>
            </div>
          )}
        </div>
      )}

      {/* 예상 피크 */}
      {comp.estimatedDaysToPeak > 0 && (
        <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400 font-mono font-medium">
            피크까지 ~{comp.estimatedDaysToPeak}일 예상
          </span>
        </div>
      )}

      {/* 주기 초과 메시지 */}
      {comp.currentDay >= comp.pastTotalDays && comp.pastTotalDays > 0 && comp.estimatedDaysToPeak === 0 && (
        <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/15">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-xs text-purple-400 font-mono font-medium">
            과거 패턴 주기 초과 · 새로운 전개
          </span>
        </div>
      )}
    </motion.div>
  )
}
