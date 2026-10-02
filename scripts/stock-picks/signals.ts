import type { StockSignals } from '@/lib/llm/_types/stock-data'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'

export const SIGNAL_SCORE_VERSION = 'technical-signals-v3-2026-10-02'

/** 종합 모델과 같은 성숙 KIS 학습 표본. 날짜별 동일 가중 중앙값을 고정해 사용한다. */
export const VOLATILITY_SCORE_REFERENCE = {
  referenceAtrPercent14: 5.221735562010756,
  referenceRows: 506470,
  referencePanels: 421,
  referenceThrough: '2026-09-29',
  referenceLastSignal: '2026-09-18',
  weighting: 'equal signal date, strict matured training rows',
  fitInputSha256: '7e390305a071d6dbb57d9b3800eb880b5ca6abcb066347f6f4fe12340bcc9ed2',
} as const

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
 * 6개 카테고리는 관측 기술지표이며 변동성은 가격 변동폭의 강도다.
 * 발행 종합점수는 선정 모델의 점수를 명시적으로 전달한다.
 * 미전달 시 가중 기술점수는 기존 연구/섀도우 경로에서만 사용한다.
 * sentiment_score도 뉴스/LLM 감성이 아니라 가격 위치·추세·연속상승의 수급심리 대용치다.
 */
export function buildSignals(feature: StockFeatureVector, selectedOverallScore?: number): StockSignals {
  if (selectedOverallScore !== undefined && (
    !Number.isInteger(selectedOverallScore) || selectedOverallScore < 0 || selectedOverallScore > 100
  )) throw new Error('선정 모델 종합 점수 불일치')
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
  const volatilityScore = feature.atrPercent14 === null || !Number.isFinite(feature.atrPercent14) || feature.atrPercent14 < 0
    ? 50
    : feature.atrPercent14 === 0 ? 0
      // 학습 중앙값=50. 큰 ATR을 0으로 자르거나 종목별 최근 순위로 보정하지 않는다.
      : clampScore(100 / (1 + VOLATILITY_SCORE_REFERENCE.referenceAtrPercent14 / feature.atrPercent14))
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
    overall_score: selectedOverallScore ?? overallScore,
  }
}
