import type { ComparisonResult } from '@/lib/tli/types'

const PEAK_ETA_MIN_SIMILARITY = 0.55

export function shouldShowPeakEta(comp: ComparisonResult, isPrePeak = true): boolean {
  return isPrePeak && comp.estimatedDaysToPeak > 0 && comp.similarity >= PEAK_ETA_MIN_SIMILARITY
}

export function generateInsight(comparisons: ComparisonResult[], isPrePeak = true): string | null {
  if (comparisons.length === 0) return null

  const highCount = comparisons.filter(c => c.similarity >= 0.7).length
  const avgSim = Math.round(
    (comparisons.reduce((s, c) => s + c.similarity, 0) / comparisons.length) * 100,
  )

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
