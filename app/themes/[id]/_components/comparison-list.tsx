'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { comparisonColors } from '@/components/tli/lifecycle-curve-data'

interface Comparison {
  pastTheme: string
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  message: string
  /** 3-Pillar 분해 */
  featureSim: number | null
  curveSim: number | null
  keywordSim: number | null
  /** 과거 테마 결과 */
  pastPeakScore: number | null
  pastFinalStage: string | null
  pastDeclineDays: number | null
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

/** 유사도 강도 뱃지 */
function getSimilarityBadge(similarity: number): { label: string; bg: string; text: string; border: string } {
  if (similarity >= 0.7) return { label: '매우 유사', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' }
  if (similarity >= 0.5) return { label: '유사', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' }
  if (similarity >= 0.35) return { label: '약한 유사', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' }
  return { label: '참고', bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' }
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
      className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 backdrop-blur-xl p-6 h-full overflow-y-auto custom-scroll"
    >
      <h2 className="text-lg font-bold mb-1">
        <span className="text-white">유사</span>
        <span className="text-emerald-400 ml-1">패턴</span>
      </h2>
      <p className="text-xs font-mono text-slate-500 mb-4">
        {comparisons.length}개 과거 테마와 비교 분석
      </p>

      <div className="space-y-3">
        {comparisons.map((comp, idx) => {
          const isSelected = selectedIndices.includes(idx)
          const simColor = getSimilarityColor(comp.similarity)
          const simPercent = Math.round(comp.similarity * 100)
          const badge = getSimilarityBadge(comp.similarity)
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
              key={comp.pastTheme}
              layout
              style={{
                borderLeftColor: comparisonColors[idx % comparisonColors.length],
                borderLeftWidth: '3px',
              }}
              className={cn(
                'p-4 rounded-lg border transition-all cursor-pointer',
                isSelected
                  ? 'bg-slate-800/70 border-emerald-500/40'
                  : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600/50'
              )}
              onClick={() => onToggleComparison?.(idx)}
            >
              {/* 상단: 테마명 (1줄) + 뱃지 (2줄) */}
              <div className="mb-3">
                <span className="text-sm font-medium text-white block mb-1.5">{comp.pastTheme}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${badge.bg} ${badge.text} ${badge.border}`}>
                    {badge.label}
                  </span>
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
              </div>

              {/* 3-Pillar 유사도 분해 */}
              <div className="space-y-1.5 mb-3">
                {comp.featureSim !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 w-10 shrink-0">특성</span>
                    <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-sky-500/70"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((comp.featureSim ?? 0) * 100)}%` }}
                        transition={{ duration: 0.6, delay: idx * 0.1 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{Math.round((comp.featureSim ?? 0) * 100)}%</span>
                  </div>
                )}
                {comp.curveSim !== null && (comp.curveSim ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 w-10 shrink-0">곡선</span>
                    <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-emerald-500/70"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((comp.curveSim ?? 0) * 100)}%` }}
                        transition={{ duration: 0.6, delay: idx * 0.1 + 0.05 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{Math.round((comp.curveSim ?? 0) * 100)}%</span>
                  </div>
                )}
                {comp.keywordSim !== null && (comp.keywordSim ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 w-10 shrink-0">키워드</span>
                    <div className="flex-1 h-1 rounded-full bg-slate-700/40 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-amber-500/70"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((comp.keywordSim ?? 0) * 100)}%` }}
                        transition={{ duration: 0.6, delay: idx * 0.1 + 0.1 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{Math.round((comp.keywordSim ?? 0) * 100)}%</span>
                  </div>
                )}
                {/* Fallback: pillar 데이터 없으면 기존 단일 바 표시 */}
                {comp.featureSim === null && (
                  <div className="relative h-1.5 rounded-full bg-slate-700/40 overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ backgroundColor: simColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${simPercent}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.1 }}
                    />
                  </div>
                )}
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

              {/* 유사 근거 + 위치 분석 */}
              {(() => {
                const parts = comp.message.split('. ').filter(Boolean)
                return (
                  <div className="space-y-1">
                    {parts[0] && (
                      <p className="text-[11px] font-mono text-slate-400">{parts[0]}.</p>
                    )}
                    {parts[1] && (
                      <p className="text-xs text-slate-300">{parts[1]}{parts[1].endsWith('.') ? '' : '.'}</p>
                    )}
                  </div>
                )
              })()}

              {/* 과거 테마 결과 (outcome) */}
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
        })}
      </div>
    </motion.div>
  )
}

export default ComparisonList
