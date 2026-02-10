/**
 * 복합 비교 (3-Pillar Composite) — 3가지 신호를 결합한 유사도 비교
 *
 * 가중치 (데이터 가용량에 따라 적응):
 *   - 14일+ 곡선: feature=0.30, curve=0.45, keyword=0.25
 *   - 7-13일 곡선: feature=0.40, curve=0.25, keyword=0.35
 *   - 7일 미만:    feature=0.55, curve=0.00, keyword=0.45
 */

import type { TimeSeriesPoint } from './timeline'
import { normalizeValues, resampleCurve } from './timeline'
import type { FeaturePopulationStats } from './similarity'
import { pearsonCorrelation, cosineSimilarity, zScoreEuclideanSimilarity, keywordJaccard } from './similarity'
import type { ThemeFeatures } from './features'
import { featuresToArray } from './features'

const MAX_LIFECYCLE_DAYS = 365

export function compositeCompare(params: {
  current: {
    features: ThemeFeatures
    curve: TimeSeriesPoint[]
    keywords: string[]
    activeDays: number
    sector: string
  }
  past: {
    features: ThemeFeatures
    curve: TimeSeriesPoint[]
    keywords: string[]
    peakDay: number
    totalDays: number
    name: string
    sector: string
  }
  populationStats?: FeaturePopulationStats
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

  // --- Pillar 1: 특성 벡터 유사도 ---
  const currentVec = featuresToArray(current.features)
  const pastVec = featuresToArray(past.features)
  const featureSim = params.populationStats
    ? zScoreEuclideanSimilarity(currentVec, pastVec, params.populationStats)
    : Math.max(0, cosineSimilarity(currentVec, pastVec))

  // --- Pillar 2: 곡선 유사도 (RMSE + 미분 상관) ---
  let curveSim = 0
  const minCurveLen = Math.min(current.curve.length, past.curve.length)
  if (minCurveLen >= 7) {
    const normCurrent = normalizeValues(current.curve)
    const normPast = normalizeValues(past.curve)
    const currentResampled = resampleCurve(normCurrent)
    const pastResampled = resampleCurve(normPast)

    // 1. RMSE: 곡선 형태 직접 비교 (값이 클수록 다른 형태)
    let sumSqDiff = 0
    for (let i = 0; i < currentResampled.length; i++) {
      sumSqDiff += (currentResampled[i] - pastResampled[i]) ** 2
    }
    const rmse = Math.sqrt(sumSqDiff / currentResampled.length)
    const shapeSim = Math.max(0, 1 - rmse * 2.5)

    // 2. 미분(변화율) 상관: 단조감소 곡선들을 구별하는 핵심
    //    급락 vs 완만하락, 변곡점 위치 차이를 감지
    const derivCurrent: number[] = []
    const derivPast: number[] = []
    for (let i = 1; i < currentResampled.length; i++) {
      derivCurrent.push(currentResampled[i] - currentResampled[i - 1])
      derivPast.push(pastResampled[i] - pastResampled[i - 1])
    }
    const derivCorr = derivCurrent.length >= 7
      ? Math.max(0, pearsonCorrelation(derivCurrent, derivPast))
      : 0

    // 결합: shapeSim 60% + derivCorr 40%
    // 모든 곡선이 하락해도 미분 패턴이 다르면 curveSim이 낮아짐
    curveSim = shapeSim * 0.6 + derivCorr * 0.4
  }

  // --- Pillar 3: 키워드 유사도 ---
  const keywordSim = keywordJaccard(current.keywords, past.keywords)

  // --- 적응적 가중치 ---
  let wFeature: number
  let wCurve: number
  let wKeyword: number

  if (minCurveLen >= 14) {
    wFeature = 0.30
    wCurve = 0.45
    wKeyword = 0.25
  } else if (minCurveLen >= 7) {
    wFeature = 0.40
    wCurve = 0.25
    wKeyword = 0.35
  } else {
    wFeature = 0.55
    wCurve = 0.00
    wKeyword = 0.45
  }

  // 키워드 dead weight 보정: keywordSim이 0이면 가중치를 feature+curve에 재분배
  if (keywordSim === 0 && wKeyword > 0) {
    const ratio = wCurve > 0 ? wFeature / (wFeature + wCurve) : 1
    wFeature += wKeyword * ratio
    wCurve += wKeyword * (1 - ratio)
    wKeyword = 0
  }
  // 가중치 상한: 단일 필러가 결과를 독점하지 않도록
  wFeature = Math.min(wFeature, 0.65)
  wCurve = Math.min(wCurve, 0.65)

  // 섹터 교차 패널티: 다른 섹터끼리 비교 시 30% 감쇄
  const sectorMatch = current.sector === past.sector || current.sector === 'etc' || past.sector === 'etc'
  const sectorFactor = sectorMatch ? 1.0 : 0.7

  const similarity = (wFeature * featureSim + wCurve * curveSim + wKeyword * keywordSim) * sectorFactor

  // 클램핑 및 소수점 3자리 반올림
  const finalSim = Math.round(Math.max(0, Math.min(1, similarity)) * 1000) / 1000

  // Peak/day 계산 — pastPeakDay는 pastTotalDays 이내로 캡 (타임라인 시각적 일관성)
  const currentDay = Math.min(current.activeDays, MAX_LIFECYCLE_DAYS)
  const pastTotalDays = Math.min(past.totalDays, MAX_LIFECYCLE_DAYS)
  const pastPeakDay = past.peakDay >= 0 ? Math.min(past.peakDay, pastTotalDays) : 0
  const estimatedDaysToPeak = pastPeakDay > 0 ? Math.max(0, pastPeakDay - currentDay) : 0

  // 유사 근거 설명 (구체적 특성 기반)
  const simParts: string[] = []

  if (wCurve > 0 && curveSim >= 0.3) {
    simParts.push(`생명주기 곡선 ${Math.round(curveSim * 100)}% 일치`)
  }

  if (featureSim >= 0.3) {
    const cF = current.features
    const pF = past.features
    const details: string[] = []

    if (Math.abs(cF.growthRate - pF.growthRate) < 0.15) details.push('성장세')
    if (Math.abs(cF.scoreLevel - pF.scoreLevel) < 0.15) {
      const scoreDiff = Math.round(Math.abs(cF.scoreLevel - pF.scoreLevel) * 100)
      details.push(`점수 수준(차이 ${scoreDiff}p)`)
    }
    if (Math.abs(cF.priceChangePct - pF.priceChangePct) < 0.15) details.push('주가 흐름')
    if (Math.abs(cF.volatility - pF.volatility) < 0.15) details.push('변동성')

    if (details.length > 0) {
      simParts.push(`${details.join(' · ')} 유사`)
    }
  }

  if (keywordSim > 0) {
    const commonKws = current.keywords.filter(k =>
      past.keywords.some(pk => pk.toLowerCase() === k.toLowerCase()),
    )
    if (commonKws.length > 0) {
      simParts.push(`공통 키워드: ${commonKws.slice(0, 3).join(', ')}`)
    } else {
      simParts.push('관련 키워드 겹침')
    }
  }

  if (!sectorMatch) {
    simParts.push(`이종 섹터 (${current.sector}↔${past.sector})`)
  }

  if (simParts.length === 0) {
    simParts.push('복합 지표 기반 약한 유사성')
  }

  // 위치 분석 — 자연어 메시지 (D+ 표기 제거)
  let positionMsg: string
  const daysToMonths = (d: number) => d >= 30 ? `${d}일(~${Math.round(d / 30)}개월)` : `${d}일`
  if (pastTotalDays < 14) {
    positionMsg = `과거 데이터 ${pastTotalDays}일로 비교 신뢰도 제한적`
  } else if (currentDay >= pastTotalDays && pastTotalDays > 0) {
    positionMsg = `${past.name}은 ${daysToMonths(pastTotalDays)} 만에 쇠퇴했으나, 현재 테마는 더 오래 지속 중`
  } else if (estimatedDaysToPeak > 0) {
    const progress = Math.round((currentDay / pastTotalDays) * 100)
    positionMsg = `${past.name} 기준 진행률 ${progress}%, 피크까지 약 ${estimatedDaysToPeak}일 남음`
  } else if (pastPeakDay > 0) {
    positionMsg = `${past.name} 피크(${pastPeakDay}일차) 부근 진입 추정`
  } else {
    positionMsg = '초기 단계, 추세 확인 중'
  }

  const message = `${simParts.join(' · ')}. ${positionMsg}`

  return {
    similarity: finalSim,
    currentDay,
    pastPeakDay,
    pastTotalDays,
    estimatedDaysToPeak,
    message,
    featureSim,
    curveSim,
    keywordSim,
  }
}
