/** 비교 리스트 한 줄 인사이트 생성 */

import type { ComparisonResult } from '@/lib/tli/types'

export function generateInsight(comparisons: ComparisonResult[], isPrePeak = true): string | null {
  if (comparisons.length === 0) return null

  const highCount = comparisons.filter(c => c.similarity >= 0.7).length
  const avgSim = Math.round(
    (comparisons.reduce((s, c) => s + c.similarity, 0) / comparisons.length) * 100,
  )

  // 높은 유사도 테마가 있으면 강조
  if (highCount > 0) {
    return `${comparisons.length}개 중 ${highCount}개가 매우 비슷해요 (70%+)`
  }

  // 정점 추정: 정점 이전 단계에서만 표시
  if (isPrePeak) {
    const peakDays = comparisons
      .filter(c => c.estimatedDaysToPeak > 0)
      .map(c => c.estimatedDaysToPeak)

    if (peakDays.length > 0) {
      const avgPeak = Math.round(peakDays.reduce((s, d) => s + d, 0) / peakDays.length)
      return `평균 유사도 ${avgSim}% · 정점까지 약 ${avgPeak}일`
    }
  }

  return `평균 유사도 ${avgSim}%`
}
