/**
 * 특성 벡터 추출 v2 — scoreLevel 제거, Dual-Axis Interest + DVI 도입
 *
 * 7차원: interestLevel, interestMomentum, volatilityDVI,
 *        newsIntensity, activeDaysNorm, priceChangePct, volumeIntensity
 */

import { avg, sigmoid_normalize, log_normalize, linearRegressionSlope, calculateDVI } from '../normalize'
import { SECTOR_KEYWORDS } from '../constants/sectors'

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
  /** 주가 방향 (sigmoid), 0-1 */
  priceChangePct: number
  /** 거래량 강도 (log_normalize), 0-1 */
  volumeIntensity: number
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

  // priceChangePct: sigmoid 정규화 (center=0, scale=5)
  const priceChangePct = sigmoid_normalize(params.avgPriceChangePct ?? 0, 0, 5)

  // volumeIntensity: log 정규화 (5천만주 기준)
  const volumeIntensity = log_normalize(params.avgVolume ?? 0, 50_000_000)

  return { interestLevel, interestMomentum, volatilityDVI, newsIntensity, activeDaysNorm, priceChangePct, volumeIntensity }
}

/** ThemeFeatures를 명시적 순서로 배열 변환 */
export function featuresToArray(f: ThemeFeatures): number[] {
  return [f.interestLevel, f.interestMomentum, f.volatilityDVI, f.newsIntensity, f.activeDaysNorm, f.priceChangePct, f.volumeIntensity]
}

// ---------------------------------------------------------------------------
// 섹터 분류
// ---------------------------------------------------------------------------

/** 키워드 기반 섹터 분류 */
export function classifySector(keywords: string[]): string {
  let bestSector = 'etc'
  let bestScore = 0
  for (const [sector, sectorKws] of Object.entries(SECTOR_KEYWORDS)) {
    const score = keywords.filter(kw =>
      sectorKws.some(sk => kw.toLowerCase().includes(sk.toLowerCase())),
    ).length
    if (score > bestScore) {
      bestScore = score
      bestSector = sector
    }
  }
  return bestSector
}
