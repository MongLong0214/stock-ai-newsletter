/** 과거 유사 테마 비교 카드 */
'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ComparisonResult } from '@/lib/tli/types'
import { formatDays } from '@/lib/tli/date-utils'
import { COMPARISON_COLORS } from '@/lib/tli/constants/comparison-colors'
import InfoTooltip from '@/components/tli/info-tooltip'
import { TOOLTIP_TEXTS } from '@/lib/tli/constants/tooltip-texts'
import PillarBars, { getSimilarityColor, getSimilarityBadge } from './pillar-bars'
import {
  getConfidenceAlertText,
  getIndependentFlowAlertText,
  getComparisonPositionText,
  getObservedWindowDays,
  shouldShowIndependentFlowAlert,
  shouldShowPeakEta,
} from './logic'

interface ComparisonCardProps {
  comp: ComparisonResult
  idx: number
  isSelected: boolean
  selectedLineIndex?: number | null
  onToggle: () => void
  /** 정점 이전 단계(Emerging/Growth)인지 — false면 "정점까지 X일" 숨김 */
  isPrePeak?: boolean
}

export default function ComparisonCard({
  comp,
  idx,
  isSelected,
  selectedLineIndex = null,
  onToggle,
  isPrePeak = true,
}: ComparisonCardProps) {
  const simColor = getSimilarityColor(comp.similarity)
  const simPercent = Math.min(99, Math.round(comp.similarity * 100))
  const badge = getSimilarityBadge(comp.similarity)
  const selectedLineColor = selectedLineIndex != null
    ? COMPARISON_COLORS[selectedLineIndex % COMPARISON_COLORS.length]
    : null
  const laneLabel = comp.comparisonLane === 'completed_analog' ? '완결 아날로그' : '활성 피어'
  const laneClass = comp.comparisonLane === 'completed_analog'
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : 'bg-sky-500/10 text-sky-300 border-sky-500/20'

  // "유사 근거. 위치 분석" 형식 분리 (첫 번째 '. '만 기준으로 분할)
  const dotIdx = comp.message.indexOf('. ')
  const rawBasis = dotIdx >= 0 ? comp.message.slice(0, dotIdx) : comp.message
  const rawPosition = getComparisonPositionText(comp) || (dotIdx >= 0 ? comp.message.slice(dotIdx + 2) : undefined)

  const independentFlowAlert = getIndependentFlowAlertText(comp)
  const confidenceAlert = getConfidenceAlertText(comp)
  const basis = sanitizeComparisonText(rawBasis)
  const position = dedupeComparisonText(rawPosition, [basis, independentFlowAlert, confidenceAlert])

  const observedWindowDays = getObservedWindowDays(comp)
  const progressPct = observedWindowDays > 0
    ? Math.min((comp.currentDay / observedWindowDays) * 100, 100) : 0
  const peakPct = observedWindowDays > 0
    ? Math.min((comp.pastPeakDay / observedWindowDays) * 100, 100) : 0

  const showTimeline = observedWindowDays >= 14 && comp.pastPeakDay >= 3 && comp.pastPeakDay <= observedWindowDays
  const showIndependentAlert = shouldShowIndependentFlowAlert(comp)
    && !!independentFlowAlert
    && !hasDuplicateComparisonText(independentFlowAlert, [basis, position])
  const showConfidenceAlert = !!confidenceAlert
    && !hasDuplicateComparisonText(confidenceAlert, [basis, position])

  return (
    <motion.div
      layout="position"
      role="button"
      data-roving-item="true"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${comp.pastTheme} 패턴을 ${isSelected ? '그래프에서 제거' : '그래프에 겹쳐 보기'}`}
      className={cn(
        'w-full text-left p-5 rounded-xl border transition-colors cursor-pointer space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        isSelected
          ? 'bg-slate-800 border-emerald-500/55 shadow-[0_0_0_1px_rgba(16,185,129,0.14),0_10px_40px_rgba(16,185,129,0.08)]'
          : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-600/50',
      )}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      {/* 헤더: 테마명 + 종합 유사도 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-white truncate leading-snug">{comp.pastTheme}</h3>
            {isSelected && selectedLineColor && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-slate-900/80 px-2 py-0.5 text-[10px] font-mono text-slate-200">
                <span
                  className="h-1.5 w-4 rounded-full"
                  style={{ backgroundColor: selectedLineColor }}
                  aria-hidden="true"
                />
                그래프 표시 중
              </span>
            )}
          </div>
          <span className={cn(
            'inline-block mt-2 text-[11px] font-mono px-2 py-0.5 rounded border',
            badge.bg, badge.text, badge.border,
          )}>
            {badge.label}
          </span>
          <span className={cn(
            'inline-block mt-2 ml-2 text-[11px] font-mono px-2 py-0.5 rounded border',
            laneClass,
          )}>
            {laneLabel}
          </span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-baseline gap-0.5">
            <span className="text-[28px] font-mono font-bold leading-none tabular-nums" style={{ color: simColor }}>
              {simPercent}
            </span>
            <span className="text-sm font-mono text-slate-500">%</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-1">
            종합 유사도
            <InfoTooltip content={TOOLTIP_TEXTS.similarity} />
          </span>
        </div>
      </div>

      {/* 세부 지표 바 */}
      <PillarBars
        featureSim={comp.featureSim}
        curveSim={comp.curveSim}
        keywordSim={comp.keywordSim}
        idx={idx}
      />

      {/* 과거 주기 타임라인 */}
      {showTimeline ? (
        <div className="space-y-2">
          <div className="relative h-2 rounded-full bg-slate-700/40">
            <div
              className="absolute top-0 h-2 w-0.5 bg-amber-400/70 rounded-full"
              style={{ left: `${peakPct}%` }}
            />
            <motion.div
              className="absolute top-0 h-2 rounded-full bg-emerald-500/25"
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.7, delay: idx * 0.08 }}
            />
            <motion.div
              className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900"
              style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.4 + idx * 0.08 }}
            />
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-slate-500">D+0</span>
            <span className="text-amber-400/80">정점 D+{comp.pastPeakDay}</span>
            <span className="text-slate-500">D+{observedWindowDays}</span>
          </div>
          <p className="text-xs font-mono text-slate-400">
            현재 <span className="text-emerald-400">{formatDays(comp.currentDay)}</span> 경과 · 과거 주기의 {Math.round(progressPct)}% 지점
          </p>
        </div>
      ) : (
        <p className="text-xs font-mono text-slate-600 text-center">
          비교 데이터가 부족해요 (관측 구간 {observedWindowDays}일)
        </p>
      )}

      {/* 유사 근거 + 위치 분석 */}
      <div className="space-y-2.5">
        {basis && <p className="text-sm font-mono text-slate-200 leading-relaxed">{basis}</p>}
        {position && (
          <div className="border-l-2 border-slate-700 pl-3">
            <p className="text-xs font-mono text-slate-400 leading-relaxed">{position}</p>
          </div>
        )}
      </div>

      {/* 과거 테마 결과 */}
      {comp.pastPeakScore !== null && (
        <div className="flex gap-2">
          <MetricCell label="최고 점수" value={String(comp.pastPeakScore)} />
          {comp.pastDeclineDays !== null && <MetricCell label="하락 기간" value={`${comp.pastDeclineDays}일`} />}
          {comp.pastFinalStage && <MetricCell label="최종 상태" value={comp.pastFinalStage} dim />}
        </div>
      )}

      {/* 상태 알림 (estimatedDaysToPeak > 0 과 isBeyondCycle은 상호 배타적) */}
      {shouldShowPeakEta(comp, isPrePeak) && (
        <AlertRow color="amber">
          과거 패턴 기준, 정점까지 약 <span className="font-medium">{comp.estimatedDaysToPeak}일</span> 추정
        </AlertRow>
      )}
      {showIndependentAlert && independentFlowAlert && (
        <AlertRow color="purple">
          {independentFlowAlert}
        </AlertRow>
      )}
      {showConfidenceAlert && confidenceAlert && (
        <AlertRow color="amber">
          {confidenceAlert}
        </AlertRow>
      )}

      <div className={cn(
        'flex items-center justify-between gap-3 pt-3 border-t text-[11px] font-mono',
        isSelected ? 'border-emerald-500/20 text-emerald-300' : 'border-slate-800/70 text-slate-500',
      )}>
        <span>{isSelected ? '차트에 비교선이 반영되어 있어요' : '선택하면 차트에 비교선이 추가돼요'}</span>
        <span className={cn(
          'px-2 py-0.5 rounded-full border transition-colors',
          isSelected
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
            : 'border-slate-700/60 text-slate-400',
        )}>
          {isSelected ? '해제' : '겹쳐 보기'}
        </span>
      </div>
    </motion.div>
  )
}

function sanitizeComparisonText(text?: string | null) {
  return text?.trim() || undefined
}

function normalizeComparisonText(text?: string | null) {
  if (!text) return ''
  return text
    .replace(/\s+/g, ' ')
    .replace(/[·.,()]/g, '')
    .trim()
}

function hasDuplicateComparisonText(text?: string | null, candidates: Array<string | null | undefined> = []) {
  const normalizedText = normalizeComparisonText(text)
  if (!normalizedText) return false

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeComparisonText(candidate)
    if (!normalizedCandidate) return false
    return normalizedCandidate === normalizedText
      || normalizedCandidate.includes(normalizedText)
      || normalizedText.includes(normalizedCandidate)
  })
}

function dedupeComparisonText(text?: string | null, candidates: Array<string | null | undefined> = []) {
  const sanitizedText = sanitizeComparisonText(text)
  if (!sanitizedText) return undefined
  return hasDuplicateComparisonText(sanitizedText, candidates) ? undefined : sanitizedText
}

/* ── 서브 컴포넌트 ── */

function MetricCell({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex-1 py-2 px-3 rounded-lg bg-slate-700/25">
      <div className="text-[11px] font-mono text-slate-500 mb-0.5">{label}</div>
      <div className={cn('text-sm font-mono font-medium', dim ? 'text-slate-400' : 'text-white')}>{value}</div>
    </div>
  )
}

const ALERT_STYLES = {
  amber: { box: 'bg-amber-500/[0.07] border-amber-500/15 text-amber-300', dot: 'bg-amber-400' },
  purple: { box: 'bg-purple-500/[0.07] border-purple-500/15 text-purple-300', dot: 'bg-purple-400' },
} as const

function AlertRow({ color, children }: { color: keyof typeof ALERT_STYLES; children: ReactNode }) {
  const s = ALERT_STYLES[color]
  return (
    <div className={cn('flex items-center gap-2 py-2 px-3 rounded-lg border', s.box)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
      <span className="text-xs font-mono">{children}</span>
    </div>
  )
}
