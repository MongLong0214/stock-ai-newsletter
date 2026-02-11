/**
 * 특성 벡터 추출 — 테마 데이터에서 수치적 특성을 요약
 */

import { avg, standardDeviation } from '../normalize'
import { SECTOR_KEYWORDS } from '../constants/sectors'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** 테마의 수치적 특성을 요약한 벡터 */
export interface ThemeFeatures {
  /** 성장률 (최근 7일 vs 이전 7일), 0-1 정규화 */
  growthRate: number
  /** 관심도 변동성 (표준편차 기반), 0-1 정규화 */
  volatility: number
  /** 뉴스 집약도 (30일 기준), 0-1 정규화 */
  newsIntensity: number
  /** 현재 점수 레벨, score / 100 */
  scoreLevel: number
  /** 활동 기간 (최대 365일 기준), 0-1 정규화 */
  activeDaysNorm: number
  /** 평균 주가 등락률, 0-1 정규화 (기본값 0.5 = 중립) */
  priceChangePct: number
  /** 평균 거래량 강도, 0-1 정규화 (기본값 0) */
  volumeIntensity: number
}

// ---------------------------------------------------------------------------
// 특성 벡터 추출
// ---------------------------------------------------------------------------

/**
 * 테마 데이터에서 수치적 특성 벡터를 추출한다.
 * 데이터가 1일분만 있어도 동작하도록 설계됨.
 */
export function extractFeatures(params: {
  scores: Array<{ score: number }>
  interestValues: number[]
  totalNewsCount: number
  activeDays: number
  avgPriceChangePct?: number  // optional — 기본값 0
  avgVolume?: number          // optional — 기본값 0
}): ThemeFeatures {
  const { scores, interestValues, totalNewsCount, activeDays } = params

  // growthRate: 최근 7일 평균 vs 이전 7일 평균 점수 비교
  const recentScores = scores.slice(0, Math.min(7, scores.length))
  const olderScores = scores.slice(7, Math.min(14, scores.length))
  const recentAvg = recentScores.length > 0 ? avg(recentScores.map(s => s.score)) : 0
  const olderAvg = olderScores.length > 0 ? avg(olderScores.map(s => s.score)) : recentAvg
  const rawGrowth = olderAvg > 0 ? (recentAvg - olderAvg) / Math.max(olderAvg, 1) : 0
  const growthRate = Math.max(0, Math.min(1, (rawGrowth + 1) / 2))

  // volatility: 관심도 값의 표준편차 (stddev 50 → 1.0)
  const vol = interestValues.length > 1 ? standardDeviation(interestValues) : 0
  const volatility = Math.min(vol / 50, 1)

  // newsIntensity: 30일 기사 수 (100건/월 → 1.0)
  const newsIntensity = Math.min(totalNewsCount / 100, 1)

  // scoreLevel: 최신 점수 / 100
  const scoreLevel = scores.length > 0 ? scores[0].score / 100 : 0

  // activeDaysNorm: 최대 365일 기준
  const activeDaysNorm = Math.min(activeDays, 365) / 365

  // priceChangePct: [-50, +50] 범위를 [0, 1]로 정규화
  const rawPricePct = params.avgPriceChangePct ?? 0
  const priceChangePct = Math.max(0, Math.min(1, (rawPricePct + 50) / 100))

  // volumeIntensity: 5천만주 기준 0-1 정규화
  const VOLUME_MAX = 50_000_000
  const volumeIntensity = Math.min((params.avgVolume ?? 0) / VOLUME_MAX, 1)

  return { growthRate, volatility, newsIntensity, scoreLevel, activeDaysNorm, priceChangePct, volumeIntensity }
}

/** ThemeFeatures를 명시적 순서로 배열 변환 */
export function featuresToArray(f: ThemeFeatures): number[] {
  return [f.growthRate, f.volatility, f.newsIntensity, f.scoreLevel, f.activeDaysNorm, f.priceChangePct, f.volumeIntensity]
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
