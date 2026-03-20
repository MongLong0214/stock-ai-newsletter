/** 복합 비교 (2-Pillar) — 특성 벡터(Mutual Rank) · 곡선 유사도 + 키워드(표시용) */

import type { TimeSeriesPoint } from './timeline'
import { normalizeValues, resampleCurve } from './timeline'
import type { FeaturePopulationStats } from './similarity'
import { pearsonCorrelation, cosineSimilarity, zScoreEuclideanSimilarity, keywordJaccard } from './similarity'
import type { ThemeFeatures } from './features'
import { featuresToArray } from './features'
import { formatDays } from '../date-utils'
import { dtwSimilarity } from './dtw'
import { getTLIParams } from '../constants/tli-params'

const MAX_LIFECYCLE_DAYS = 365

// 2-Pillar 적응적 가중치 (곡선 데이터 가용량 기준)
// 14일+ → feature:0.40 curve:0.60
// 7-13일 → feature:0.60 curve:0.40
// 7일 미만 → feature:1.00 curve:0.00

interface CurrentInput {
  features: ThemeFeatures
  curve: TimeSeriesPoint[]
  resampledCurve?: number[]
  keywords: string[]
  keywordsLower?: Set<string>
  activeDays: number
  sector: string
  sectorConfidence?: number
}

interface PastInput {
  features: ThemeFeatures
  curve: TimeSeriesPoint[]
  resampledCurve?: number[]
  keywords: string[]
  keywordsLower?: Set<string>
  peakDay: number
  totalDays: number
  name: string
  sector: string
  sectorConfidence?: number
  isActive?: boolean
}

export interface CompositeWeightConfig {
  weightVersion?: string
  wFeature?: number
  wCurve?: number
  wKeyword?: number
  sectorPenalty: number
  curveBucketPolicy?: {
    gte14: { wFeature: number; wCurve: number; wKeyword: number }
    gte7: { wFeature: number; wCurve: number; wKeyword: number }
    lt7: { wFeature: number; wCurve: number; wKeyword: number }
  }
}

function resolveCompositeWeights(minCurveLen: number, weightConfig?: CompositeWeightConfig) {
  if (weightConfig?.curveBucketPolicy) {
    if (minCurveLen >= 14) return weightConfig.curveBucketPolicy.gte14
    if (minCurveLen >= 7) return weightConfig.curveBucketPolicy.gte7
    return weightConfig.curveBucketPolicy.lt7
  }

  if (weightConfig && weightConfig.wFeature != null && weightConfig.wCurve != null && weightConfig.wKeyword != null) {
    return {
      wFeature: weightConfig.wFeature,
      wCurve: weightConfig.wCurve,
      wKeyword: weightConfig.wKeyword,
    }
  }

  if (minCurveLen >= 14) return { wFeature: 0.40, wCurve: 0.60, wKeyword: 0.00 }
  if (minCurveLen >= 7) return { wFeature: 0.60, wCurve: 0.40, wKeyword: 0.00 }
  return { wFeature: 1.00, wCurve: 0.00, wKeyword: 0.00 }
}

export function compositeCompare(params: {
  current: CurrentInput
  past: PastInput
  populationStats?: FeaturePopulationStats
  precomputedFeatureSim?: number
  precomputedCurveSim?: number
  weightConfig?: CompositeWeightConfig
  keywordSupportCounts?: Map<string, number>
}): {
  similarity: number
  currentDay: number
  pastPeakDay: number
  pastTotalDays: number
  estimatedDaysToPeak: number
  message: string
  featureSim: number
  curveSim: number
  keywordSim: number
} {
  const { current, past } = params

  // 특성 벡터 유사도 (Mutual Rank 우선 → z-score 폴백 → 코사인 폴백)
  const featureSim = params.precomputedFeatureSim !== undefined
    ? params.precomputedFeatureSim
    : params.populationStats
      ? zScoreEuclideanSimilarity(featuresToArray(current.features), featuresToArray(past.features), params.populationStats)
      : Math.max(0, cosineSimilarity(featuresToArray(current.features), featuresToArray(past.features)))

  // 곡선 유사도 (Mutual Rank 우선 → RMSE+미분상관 폴백)
  const { curveSim: rawCurveSim, minCurveLen } = computeCurveSim(
    current.curve, past.curve, current.resampledCurve, past.resampledCurve,
  )
  const curveSim = params.precomputedCurveSim !== undefined
    ? params.precomputedCurveSim
    : rawCurveSim

  // 키워드 자카드 (표시용, 점수 미반영)
  const keywordSim = current.keywordsLower && past.keywordsLower
    ? keywordJaccard(current.keywordsLower, past.keywordsLower, { supportCounts: params.keywordSupportCounts })
    : keywordJaccard(current.keywords, past.keywords, { supportCounts: params.keywordSupportCounts })

  const { wFeature, wCurve, wKeyword } = resolveCompositeWeights(minCurveLen, params.weightConfig)
  const totalWeight = Math.max(wFeature + wCurve + wKeyword, 1)

  // 섹터 교차 패널티 (이종 섹터 15% 감쇄)
  const sectorMatch = current.sector === past.sector
  const minSectorConfidence = Math.min(current.sectorConfidence ?? 1, past.sectorConfidence ?? 1)
  const sectorPenalty = sectorMatch
    ? 1
    : (current.sector === 'etc' || past.sector === 'etc' || minSectorConfidence < 0.5)
      ? 0.95
      : (params.weightConfig?.sectorPenalty ?? 0.85)
  const rawSim = (
    (wFeature * featureSim + wCurve * curveSim + wKeyword * keywordSim) / totalWeight
  ) * sectorPenalty
  const similarity = Math.round(Math.max(0, Math.min(0.99, rawSim)) * 1000) / 1000

  // 일수 캡핑
  const currentDay = Math.min(current.activeDays, MAX_LIFECYCLE_DAYS)
  const pastTotalDays = Math.min(past.totalDays, MAX_LIFECYCLE_DAYS)
  const pastPeakDay = past.peakDay >= 0 ? Math.min(past.peakDay, pastTotalDays) : 0
  const estimatedDaysToPeak = pastPeakDay > 0 ? Math.max(0, pastPeakDay - currentDay) : 0

  return {
    similarity, currentDay, pastPeakDay, pastTotalDays, estimatedDaysToPeak,
    message: buildMessage(current, past, {
      featureSim, curveSim, keywordSim, wCurve, sectorMatch,
      pastTotalDays, currentDay, pastPeakDay, estimatedDaysToPeak,
    }),
    featureSim, curveSim, keywordSim,
  }
}

// ── 곡선 유사도 계산 ─────────────────────────────────────────────────────────

function computeCurveSim(
  currentCurve: TimeSeriesPoint[],
  pastCurve: TimeSeriesPoint[],
  cachedCurrent?: number[],
  cachedPast?: number[],
): { curveSim: number; minCurveLen: number } {
  const minCurveLen = Math.min(currentCurve.length, pastCurve.length)
  if (minCurveLen < 7) return { curveSim: 0, minCurveLen }

  const cR = cachedCurrent?.length ? cachedCurrent : resampleCurve(normalizeValues(currentCurve))
  const pR = cachedPast?.length ? cachedPast : resampleCurve(normalizeValues(pastCurve))

  // RMSE 형태 유사도 (캐시 길이 불일치 방어)
  const len = Math.min(cR.length, pR.length)
  if (len === 0) return { curveSim: 0, minCurveLen }
  let sumSqDiff = 0
  for (let i = 0; i < len; i++) sumSqDiff += (cR[i] - pR[i]) ** 2
  const shapeSim = Math.max(0, 1 - Math.sqrt(sumSqDiff / len) * 2.5)

  // 미분 상관: 변화율 패턴으로 단조감소 곡선 구별
  const dC: number[] = [], dP: number[] = []
  const derivLen = Math.min(cR.length, pR.length)
  for (let i = 1; i < derivLen; i++) {
    dC.push(cR[i] - cR[i - 1])
    dP.push(pR[i] - pR[i - 1])
  }
  const derivCorr = dC.length >= 7 ? Math.max(0, pearsonCorrelation(dC, dP)) : 0

  // DTW similarity (phase-shift resistant)
  const dtwSim = dtwSimilarity(cR, pR)

  // 3-signal ensemble
  const cfg = getTLIParams()
  return { curveSim: shapeSim * cfg.curve_shape_weight + derivCorr * cfg.curve_derivative_weight + dtwSim * cfg.curve_dtw_weight, minCurveLen }
}

// ── 메시지 생성 ──────────────────────────────────────────────────────────────

interface MessageCtx {
  featureSim: number; curveSim: number; keywordSim: number
  wCurve: number; sectorMatch: boolean
  pastTotalDays: number; currentDay: number; pastPeakDay: number; estimatedDaysToPeak: number
}

function buildMessage(current: CurrentInput, past: PastInput, ctx: MessageCtx): string {
  const parts: string[] = []

  // 곡선 유사도 근거
  if (ctx.wCurve > 0 && ctx.curveSim >= 0.3) {
    parts.push(`추세 흐름 ${Math.round(ctx.curveSim * 100)}% 일치`)
  }

  // 특성 벡터 유사도 근거
  if (ctx.featureSim >= 0.3) {
    const cF = current.features, pF = past.features
    const details: string[] = []
    if (Math.abs(cF.interestMomentum - pF.interestMomentum) < 0.15) details.push('성장세')
    if (Math.abs(cF.interestLevel - pF.interestLevel) < 0.15) {
      details.push(`관심도 수준(차이 ${Math.round(Math.abs(cF.interestLevel - pF.interestLevel) * 100)}p)`)
    }
    if (Math.abs(cF.priceChangePct - pF.priceChangePct) < 0.15) details.push('주가 흐름')
    if (Math.abs(cF.volatilityDVI - pF.volatilityDVI) < 0.15) details.push('변동성')
    if (details.length > 0) parts.push(`${details.join(' · ')} 유사`)
  }

  // 키워드 겹침 근거
  if (ctx.keywordSim > 0) {
    const common = current.keywords.filter(k =>
      past.keywords.some(pk => pk.toLowerCase() === k.toLowerCase()),
    )
    parts.push(common.length > 0 ? `공통 키워드: ${common.slice(0, 3).join(', ')}` : '관련 키워드 겹침')
  }

  if (!ctx.sectorMatch) parts.push(`이종 섹터 (${current.sector}↔${past.sector})`)
  if (parts.length === 0) parts.push('종합 지표 기반 약한 유사성')

  // 위치 분석
  let position: string
  if (ctx.pastTotalDays < 14) {
    position = `과거 데이터 ${ctx.pastTotalDays}일로 비교 신뢰도가 낮아요`
  } else if (ctx.currentDay >= ctx.pastTotalDays && ctx.pastTotalDays > 0) {
    position = past.isActive === false
      ? `${past.name}은 ${formatDays(ctx.pastTotalDays)} 만에 종료됐고, 현재 테마는 이를 넘어섰어요`
      : `${past.name}의 현재 관측 구간(${formatDays(ctx.pastTotalDays)})을 넘어섰어요`
  } else if (ctx.estimatedDaysToPeak > 0) {
    position = `${past.name} 기준 진행률 ${Math.round((ctx.currentDay / ctx.pastTotalDays) * 100)}%, 정점까지 약 ${ctx.estimatedDaysToPeak}일 남음`
  } else if (ctx.pastPeakDay > 0) {
    position = `${past.name} 정점(${ctx.pastPeakDay}일차) 부근 진입 추정`
  } else {
    position = '초기 단계, 추세 확인 중'
  }

  return `${parts.join(' · ')}. ${position}`
}
