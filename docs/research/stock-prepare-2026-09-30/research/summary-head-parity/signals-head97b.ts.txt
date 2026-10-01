import type { StockSignals } from '@/lib/llm/_types/stock-data'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'

export const SIGNAL_SCORE_VERSION = 'technical-signals-v2-2026-09-30'

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)
const clampScore = (value: number): number => Math.round(clamp(value, 0, 100))
const average = (values: readonly number[]): number => (
  values.reduce((sum, value) => sum + value, 0) / values.length
)
export const finiteOr = (value: number | null, fallback = 50): number => (
  value !== null && Number.isFinite(value) ? value : fallback
)
const isPositiveFinite = (value: number | null): value is number => (
  value !== null && Number.isFinite(value) && value > 0
)
const centeredScore = (value: number | null, fullScale: number): number => (
  value === null || !Number.isFinite(value) ? 50 : clampScore(50 + value / fullScale * 50)
)

/**
 * 레거시 7개 카테고리를 전부 관측 기술지표로만 산출한다.
 * sentiment_score도 뉴스/LLM 감성이 아니라 가격 위치·추세·연속상승의 수급심리 대용치다.
 */
export function buildSignals(feature: StockFeatureVector): StockSignals {
  const sma60Distance = isPositiveFinite(feature.close) && isPositiveFinite(feature.sma60)
    ? (feature.close / feature.sma60 - 1) * 100
    : null
  const smaCrossDistance = isPositiveFinite(feature.sma20) && isPositiveFinite(feature.sma60)
    ? (feature.sma20 / feature.sma60 - 1) * 100
    : null
  const macdPercent = isPositiveFinite(feature.close) && feature.macdHistogram !== null
    ? feature.macdHistogram / feature.close * 100
    : null
  // volumeRatio20 = 당일 거래량 / 20일 평균 거래량이다.
  // OBV 기울기는 같은 평균 거래량으로 정규화해 조용한 하루가 수급 강도를 부풀리지 않게 한다.
  const averageVolume20 = isPositiveFinite(feature.volume) && isPositiveFinite(feature.volumeRatio20)
    ? feature.volume / feature.volumeRatio20
    : null
  const obvAverageVolume = isPositiveFinite(averageVolume20) && feature.obvSlope20 !== null
    ? feature.obvSlope20 / averageVolume20
    : null
  const signedTrendFit = feature.trendR2_20 !== null && Number.isFinite(feature.trendR2_20)
    && feature.trendR2_20 >= 0 && feature.trendSlope20 !== null && Number.isFinite(feature.trendSlope20)
    ? clampScore(50 + Math.sign(feature.trendSlope20) * clamp(feature.trendR2_20, 0, 1) * 50)
    : 50
  const positionScore = feature.position52wFullWindow && feature.position52wObservations >= 252
    ? clampScore(finiteOr(feature.position52w, 0.5) * 100)
    : 50

  const trendScore = clampScore(average([
    centeredScore(feature.sma20DistancePercent, 10),
    centeredScore(sma60Distance, 20),
    centeredScore(feature.sma20Slope5 === null ? null : feature.sma20Slope5 * 100, 1),
    signedTrendFit,
  ]))
  const momentumScore = clampScore(average([
    clampScore(finiteOr(feature.rsi14)),
    centeredScore(macdPercent, 2),
    feature.bullishCandle === null ? 50 : feature.bullishCandle ? 65 : 35,
    clampScore(50 + finiteOr(feature.consecutiveUpDays, 0) * 10),
  ]))
  const volumeScore = clampScore(average([
    clampScore(finiteOr(feature.volumePercentile60)),
    centeredScore(feature.volumeRatio20 === null ? null : feature.volumeRatio20 - 1, 2),
    centeredScore(obvAverageVolume, 0.5),
  ]))
  const volatilityScore = feature.atrPercent14 === null || !Number.isFinite(feature.atrPercent14)
    ? 50
    : clampScore(100 - Math.abs(feature.atrPercent14 - 3) * 20)
  const patternScore = clampScore(average([
    centeredScore(feature.distanceFromHigh60, 5),
    feature.bullishCandle === null ? 50 : feature.bullishCandle ? 70 : 30,
    centeredScore(smaCrossDistance, 5),
    positionScore,
  ]))
  const sentimentScore = clampScore(average([
    positionScore,
    centeredScore(feature.trendSlope20 === null ? null : feature.trendSlope20 * 100, 1),
    clampScore(50 + finiteOr(feature.consecutiveUpDays, 0) * 10),
  ]))
  const overallScore = clampScore(
    trendScore * 0.20
    + momentumScore * 0.15
    + volumeScore * 0.25
    + volatilityScore * 0.10
    + patternScore * 0.20
    + sentimentScore * 0.10,
  )

  return {
    trend_score: trendScore,
    momentum_score: momentumScore,
    volume_score: volumeScore,
    volatility_score: volatilityScore,
    pattern_score: patternScore,
    sentiment_score: sentimentScore,
    overall_score: overallScore,
  }
}
