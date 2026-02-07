/** 신뢰도 수준 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/** 비교 데이터 기반 예측 계산 결과 */
export interface PredictionResult {
  daysSinceSpike: number
  avgSimilarity: number
  avgDaysToPeak: number
  avgTotalDays: number
  currentProgress: number
  peakProgress: number
  avgPeakDay: number
  confidence: ConfidenceLevel
}

interface ComparisonInput {
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

/** 신뢰도 계산 */
function getConfidence(count: number, avgSimilarity: number): ConfidenceLevel {
  if (count >= 4 && avgSimilarity >= 0.7) return 'high'
  if (count >= 2 && avgSimilarity >= 0.5) return 'medium'
  return 'low'
}

/** 비교 데이터 기반 예측 계산 (유사도 가중 평균) */
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

  // 유사도 가중 합계
  const totalWeight = comparisons.reduce((sum, c) => sum + c.similarity, 0)

  // 가중 평균 예상 피크까지 일수
  const validPeakDays = comparisons.filter(c => c.estimatedDaysToPeak > 0)
  const validPeakWeight = validPeakDays.reduce((sum, c) => sum + c.similarity, 0)
  const avgDaysToPeak =
    validPeakDays.length > 0 && validPeakWeight > 0
      ? Math.round(
          validPeakDays.reduce((sum, c) => sum + c.estimatedDaysToPeak * c.similarity, 0) /
            validPeakWeight
        )
      : 0

  // 가중 평균 전체 주기 (상한 365일)
  const avgTotalDays = totalWeight > 0
    ? Math.min(
        Math.round(
          comparisons.reduce((sum, c) => sum + c.pastTotalDays * c.similarity, 0) / totalWeight
        ),
        365
      )
    : 0

  // 현재 위치 (전체 주기 대비 %)
  const currentProgress = avgTotalDays > 0
    ? Math.min((daysSinceSpike / avgTotalDays) * 100, 100)
    : 0

  // 가중 평균 피크 위치
  const avgPeakDay = totalWeight > 0
    ? Math.round(
        comparisons.reduce((sum, c) => sum + c.pastPeakDay * c.similarity, 0) / totalWeight
      )
    : 0
  const peakProgress = avgTotalDays > 0
    ? Math.min((avgPeakDay / avgTotalDays) * 100, 100)
    : 0

  // 신뢰도
  const confidence = getConfidence(comparisons.length, avgSimilarity)

  return {
    daysSinceSpike,
    avgSimilarity,
    avgDaysToPeak,
    avgTotalDays,
    currentProgress,
    peakProgress,
    avgPeakDay,
    confidence,
  }
}
