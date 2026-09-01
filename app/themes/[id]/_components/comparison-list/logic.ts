import type { ComparisonResult } from '@/lib/tli/types'
import { formatDays } from '@/lib/tli/date-utils'

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
  void comp
  void isPrePeak
  return false
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
  return `${comp.pastTheme} 관측 구간 ${formatDays(observedWindowDays)}`
}

export function generateInsight(comparisons: ComparisonResult[], isPrePeak = true): string | null {
  void comparisons
  void isPrePeak
  return null
}

export function getConfidenceAlertText(comp: ComparisonResult): string | null {
  void comp
  return null
}
