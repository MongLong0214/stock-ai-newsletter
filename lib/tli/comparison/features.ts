/**
 * 특성 벡터 추출 v2 — scoreLevel 제거, Dual-Axis Interest + DVI 도입
 *
 * 11차원: interestLevel, interestMomentum, volatilityDVI,
 *         newsIntensity, activeDaysNorm, lifecyclePosition, recoverySignal,
 *         sectorConfidence, keywordSpecificity, priceChangePct, volumeIntensity
 */

import { avg, sigmoid_normalize, log_normalize, linearRegressionSlope, calculateDVI } from '../normalize'
import { SECTOR_KEYWORDS } from '../constants/sectors'
import { getTLIParams } from '../constants/tli-params'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** 테마의 수치적 특성을 요약한 벡터 (v2 — scoreLevel 제거) */
export interface ThemeFeatures {
  /** 관심도 절대 수준 (cross-sectional percentileRank 또는 sigmoid fallback), 0-1 */
  interestLevel: number
  /** 관심도 시계열 방향 (linearRegression slope → sigmoid), 0-1 */
  interestMomentum: number
  /** 방향성 변동 지수 (DVI — RSI 원리), 0-1 */
  volatilityDVI: number
  /** 뉴스 집약도 (log_normalize), 0-1 */
  newsIntensity: number
  /** 활동 기간 (최대 365일 기준), 0-1 */
  activeDaysNorm: number
  /** 연속형 라이프사이클 위치 — 관측된 고점 이후 진행 정도와 drawdown 기반, 0-1 */
  lifecyclePosition: number
  /** 연속형 stage proxy — 후기 사이클에서 회복 중일수록 높음, 0-1 */
  recoverySignal: number
  /** 섹터 분류 신뢰도, 0-1 */
  sectorConfidence: number
  /** 키워드 희소성/특이성, 0-1 */
  keywordSpecificity: number
  /** 주가 방향 (sigmoid), 0-1 */
  priceChangePct: number
  /** 거래량 강도 (log_normalize), 0-1 */
  volumeIntensity: number
}

export interface SectorProfile {
  sector: string
  confidence: number
  matchedKeywords: number
}

export function computeLifecyclePosition(interestValues: number[]): number {
  if (interestValues.length < 2) return 0.5

  const peakValue = Math.max(...interestValues)
  if (!Number.isFinite(peakValue) || peakValue <= 0) return 0.5

  const currentIndex = interestValues.length - 1
  const peakIndex = interestValues.lastIndexOf(peakValue)
  const currentValue = interestValues[currentIndex] ?? peakValue
  const postPeakAge = currentIndex > 0 ? (currentIndex - peakIndex) / currentIndex : 0
  const drawdownFromPeak = Math.max(0, 1 - currentValue / peakValue)

  const cfg = getTLIParams()
  return Math.max(0, Math.min(1, postPeakAge * cfg.lifecycle_post_peak_weight + drawdownFromPeak * cfg.lifecycle_drawdown_weight))
}

const GENERIC_THEME_KEYWORDS = new Set([
  '테마',
  '관련주',
  '수혜주',
  '종목',
  '주가',
  '정책',
])

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function computeRecoverySignal(input: {
  interestValues: number[]
  lifecyclePosition: number
}) {
  const recentWindow = input.interestValues.slice(-Math.min(4, input.interestValues.length))
  const recentSlope = recentWindow.length >= 2 ? linearRegressionSlope(recentWindow) : 0
  const recentMomentum = sigmoid_normalize(recentSlope, 0, 1.5)
  const positiveMomentum = clamp01((recentMomentum - 0.5) * 2)
  return clamp01(positiveMomentum * input.lifecyclePosition)
}

export function computeKeywordSpecificity(
  keywords: string[],
  keywordSupportCounts?: Map<string, number>,
) {
  if (keywords.length === 0) return 0
  if (!keywordSupportCounts) return 0.5

  const normalizedKeywords = [...new Set(keywords.map((keyword) => keyword.toLowerCase()))]
  const scores = normalizedKeywords.map((keyword) => {
    const genericPenalty = GENERIC_THEME_KEYWORDS.has(keyword) ? 0.2 : 1
    const support = keywordSupportCounts.get(keyword)
    const rarityScore = support != null && support > 0 ? 1 / Math.sqrt(support) : 1
    return clamp01(genericPenalty * rarityScore * 1.5)
  })

  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

// ---------------------------------------------------------------------------
// 특성 벡터 추출
// ---------------------------------------------------------------------------

/**
 * 테마 데이터에서 수치적 특성 벡터를 추출한다.
 * v2: scoreLevel 제거 (순환 의존 차단), interestLevel + interestMomentum + DVI 도입
 */
export function extractFeatures(params: {
  /** 정규화된 관심도 값 (시간순 ASC) */
  interestValues: number[]
  totalNewsCount: number
  activeDays: number
  avgPriceChangePct?: number
  avgVolume?: number
  /** Cross-sectional percentileRank (0-1). 미제공 시 sigmoid fallback */
  interestLevel?: number
  keywords?: string[]
  keywordSupportCounts?: Map<string, number>
  sectorConfidence?: number
}): ThemeFeatures {
  const { interestValues, totalNewsCount, activeDays } = params

  // interestLevel: cross-sectional 수준 (pre-computed percentile 우선)
  let interestLevel: number
  if (params.interestLevel !== undefined) {
    interestLevel = params.interestLevel
  } else {
    // sigmoid fallback: 관심도 평균 기반
    const meanInterest = interestValues.length > 0 ? avg(interestValues) : 0
    interestLevel = sigmoid_normalize(meanInterest, 30, 20)
  }

  // interestMomentum: 최근 7일 관심도 기울기 → sigmoid
  const recent7 = interestValues.slice(-Math.min(7, interestValues.length))
  const slope = recent7.length >= 2 ? linearRegressionSlope(recent7) : 0
  const interestMomentum = sigmoid_normalize(slope, 0, 1.5)

  // volatilityDVI: 방향성 변동 지수 (RSI 원리)
  const recent7d = interestValues.slice(-Math.min(7, interestValues.length))
  const volatilityDVI = calculateDVI(recent7d)

  // newsIntensity: log 정규화 (100건/월 → ~1.0)
  const newsIntensity = log_normalize(totalNewsCount, 100)

  // activeDaysNorm: 최대 365일 기준
  const activeDaysNorm = Math.min(activeDays, 365) / 365
  const lifecyclePosition = computeLifecyclePosition(interestValues)
  const recoverySignal = computeRecoverySignal({ interestValues, lifecyclePosition })
  const sectorConfidence = clamp01(params.sectorConfidence ?? 0.5)
  const keywordSpecificity = computeKeywordSpecificity(params.keywords ?? [], params.keywordSupportCounts)

  // priceChangePct: sigmoid 정규화 (center=0, scale=5)
  const priceChangePct = sigmoid_normalize(params.avgPriceChangePct ?? 0, 0, 5)

  // volumeIntensity: log 정규화 (5천만주 기준)
  const volumeIntensity = log_normalize(params.avgVolume ?? 0, 50_000_000)

  return {
    interestLevel,
    interestMomentum,
    volatilityDVI,
    newsIntensity,
    activeDaysNorm,
    lifecyclePosition,
    recoverySignal,
    sectorConfidence,
    keywordSpecificity,
    priceChangePct,
    volumeIntensity,
  }
}

/** ThemeFeatures를 명시적 순서로 배열 변환 */
export function featuresToArray(f: ThemeFeatures): number[] {
  return [
    f.interestLevel,
    f.interestMomentum,
    f.volatilityDVI,
    f.newsIntensity,
    f.activeDaysNorm,
    f.lifecyclePosition,
    f.recoverySignal,
    f.sectorConfidence,
    f.keywordSpecificity,
    f.priceChangePct,
    f.volumeIntensity,
  ]
}

// ---------------------------------------------------------------------------
// 섹터 분류
// ---------------------------------------------------------------------------

/** 키워드 기반 섹터 분류 */
export function classifySector(keywords: string[]): string {
  return classifySectorProfile(keywords).sector
}

export function classifySectorProfile(keywords: string[]): SectorProfile {
  let bestSector = 'etc'
  let bestScore = 0
  let secondScore = 0
  let totalMatchedKeywords = 0

  for (const [sector, sectorKws] of Object.entries(SECTOR_KEYWORDS)) {
    const score = keywords.filter((kw) =>
      sectorKws.some((sk) => kw.toLowerCase().includes(sk.toLowerCase())),
    ).length

    if (score > 0) totalMatchedKeywords += score

    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestSector = sector
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  if (bestScore === 0) {
    return { sector: 'etc', confidence: 0.2, matchedKeywords: 0 }
  }

  const dominance = bestScore / Math.max(1, totalMatchedKeywords)
  const margin = (bestScore - secondScore) / Math.max(1, bestScore)
  const confidence = Math.max(0.2, Math.min(1, dominance * 0.7 + margin * 0.3))

  return {
    sector: bestSector,
    confidence,
    matchedKeywords: bestScore,
  }
}
