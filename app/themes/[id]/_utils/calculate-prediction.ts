/** 비교 데이터 기반 예측 계산 결과 */
export interface PredictionResult {
  daysSinceSpike: number
  avgSimilarity: number
  avgDaysToPeak: number
  avgTotalDays: number
  currentProgress: number
  peakProgress: number
  avgPeakDay: number
}

interface ComparisonInput {
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

/** 비교 데이터 기반 예측 계산 */
export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: ComparisonInput[]
): PredictionResult | null {
  if (!comparisons.length) return null

  // 경과일 계산
  const daysSinceSpike = firstSpikeDate
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(firstSpikeDate).getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0

  // 평균 유사도
  const avgSimilarity =
    comparisons.reduce((sum, c) => sum + c.similarity, 0) / comparisons.length

  // 평균 예상 피크까지 일수
  const validPeakDays = comparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak =
    validPeakDays.length > 0
      ? Math.round(
          validPeakDays.reduce((sum, c) => sum + c.estimatedDaysToPeak, 0) /
            validPeakDays.length
        )
      : 0

  // 평균 전체 주기 (상한 365일)
  const avgTotalDays = Math.min(
    Math.round(
      comparisons.reduce((sum, c) => sum + c.pastTotalDays, 0) / comparisons.length
    ),
    365
  )

  // 현재 위치 (전체 주기 대비 %)
  const currentProgress = avgTotalDays > 0
    ? Math.min((daysSinceSpike / avgTotalDays) * 100, 100)
    : 0

  // 평균 피크 위치 (전체 주기 대비 %)
  const avgPeakDay = Math.round(
    comparisons.reduce((sum, c) => sum + c.pastPeakDay, 0) / comparisons.length
  )
  const peakProgress = avgTotalDays > 0
    ? Math.min((avgPeakDay / avgTotalDays) * 100, 100)
    : 0

  return {
    daysSinceSpike,
    avgSimilarity,
    avgDaysToPeak,
    avgTotalDays,
    currentProgress,
    peakProgress,
    avgPeakDay,
  }
}
