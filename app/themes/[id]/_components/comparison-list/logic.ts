import type { ComparisonResult } from '@/lib/tli/types'
import { formatDays } from '@/lib/tli/date-utils'

const PEAK_ETA_MIN_SIMILARITY = 0.55

export function getObservedWindowDays(comp: ComparisonResult) {
  return comp.observedWindowDays ?? comp.pastTotalDays
}

export function getCompletedCycleDays(comp: ComparisonResult) {
  return comp.completedCycleDays ?? null
}

export function isCompletedCycleComparison(comp: ComparisonResult) {
  if (comp.cycleCompletionStatus) {
    return comp.cycleCompletionStatus === 'completed'
  }
  if (comp.isPastActive != null) {
    return comp.isPastActive === false
  }
  return comp.pastFinalStage != null
}

export function shouldShowPeakEta(comp: ComparisonResult, isPrePeak = true): boolean {
  return isPrePeak
    && comp.comparisonLane !== 'active_peer'
    && comp.estimatedDaysToPeak > 0
    && comp.similarity >= PEAK_ETA_MIN_SIMILARITY
}

export function shouldShowIndependentFlowAlert(comp: ComparisonResult) {
  const completedCycleDays = getCompletedCycleDays(comp)
  if (!isCompletedCycleComparison(comp)) return false
  if (completedCycleDays == null || completedCycleDays <= 0) return false
  return comp.currentDay > completedCycleDays && comp.estimatedDaysToPeak === 0
}

export function getIndependentFlowAlertText(comp: ComparisonResult): string | null {
  if (!shouldShowIndependentFlowAlert(comp)) return null
  const completedCycleDays = getCompletedCycleDays(comp)
  if (completedCycleDays == null) return null
  return `${comp.pastTheme} 완결 주기(${completedCycleDays}일)를 넘어섰어요 · 독자적 흐름 가능성`
}

export function getComparisonPositionText(comp: ComparisonResult): string {
  const observedWindowDays = getObservedWindowDays(comp)
  const completedCycleDays = getCompletedCycleDays(comp)

  if (observedWindowDays < 14) {
    return `과거 데이터 ${observedWindowDays}일로 비교 신뢰도가 낮아요`
  }

  if (shouldShowIndependentFlowAlert(comp) && completedCycleDays != null) {
    return `${comp.pastTheme} 완결 주기(${formatDays(completedCycleDays)})를 넘어섰어요`
  }

  if (comp.currentDay >= observedWindowDays && comp.estimatedDaysToPeak === 0) {
    return `${comp.pastTheme}의 현재 관측 구간(${formatDays(observedWindowDays)})을 넘어섰어요`
  }

  if (comp.estimatedDaysToPeak > 0) {
    return `${comp.pastTheme} 기준 진행률 ${Math.round((comp.currentDay / observedWindowDays) * 100)}%, 정점까지 약 ${comp.estimatedDaysToPeak}일 남음`
  }

  if (comp.pastPeakDay > 0) {
    return `${comp.pastTheme} 정점(${comp.pastPeakDay}일차) 부근 진입 추정`
  }

  return '초기 단계, 추세 확인 중'
}

export function generateInsight(comparisons: ComparisonResult[], isPrePeak = true): string | null {
  if (comparisons.length === 0) return null

  const highCount = comparisons.filter(c => c.similarity >= 0.7).length
  const avgSim = Math.round(
    (comparisons.reduce((s, c) => s + c.similarity, 0) / comparisons.length) * 100,
  )
  const completedCount = comparisons.filter((comparison) => comparison.comparisonLane === 'completed_analog').length
  const peerCount = comparisons.filter((comparison) => comparison.comparisonLane === 'active_peer').length

  if (completedCount > 0 && peerCount > 0) {
    return `평균 유사도 ${avgSim}% · 완결 아날로그 ${completedCount}개 · 활성 피어 ${peerCount}개`
  }

  if (highCount > 0) {
    return `${comparisons.length}개 중 ${highCount}개가 매우 비슷해요 (70%+)`
  }

  if (isPrePeak) {
    const peakDays = comparisons
      .filter((comparison) => shouldShowPeakEta(comparison, true))
      .map((comparison) => comparison.estimatedDaysToPeak)

    if (peakDays.length >= 2) {
      const avgPeak = Math.round(peakDays.reduce((s, d) => s + d, 0) / peakDays.length)
      return `평균 유사도 ${avgSim}% · 정점까지 약 ${avgPeak}일`
    }
  }

  return `평균 유사도 ${avgSim}%`
}

export function getConfidenceAlertText(comp: ComparisonResult): string | null {
  if (comp.confidenceTier !== 'low') return null
  if (comp.supportCount != null) {
    return `비교 신뢰도가 낮아요 · 유효 근거 ${comp.supportCount}건`
  }
  return '비교 신뢰도가 낮아요 · 표본이 충분하지 않습니다'
}
