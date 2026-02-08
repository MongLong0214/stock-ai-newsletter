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

  // --- Pillar 2: 곡선 상관관계 (위상 정렬 기반) ---
  let curveSim = 0
  const minCurveLen = Math.min(current.curve.length, past.curve.length)
  if (minCurveLen >= 7) {
    const normCurrent = normalizeValues(current.curve)
    const normPast = normalizeValues(past.curve)
    const currentResampled = resampleCurve(normCurrent)
    const pastResampled = resampleCurve(normPast)
    const rawCorr = pearsonCorrelation(currentResampled, pastResampled)
    curveSim = Math.max(0, rawCorr)
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

  // 섹터 교차 패널티: 다른 섹터끼리 비교 시 30% 감쇄
  const sectorMatch = current.sector === past.sector || current.sector === 'etc' || past.sector === 'etc'
  const sectorFactor = sectorMatch ? 1.0 : 0.7

  const similarity = (wFeature * featureSim + wCurve * curveSim + wKeyword * keywordSim) * sectorFactor

  // 클램핑 및 소수점 3자리 반올림
  const finalSim = Math.round(Math.max(0, Math.min(1, similarity)) * 1000) / 1000

  // Peak/day 계산
  const currentDay = current.activeDays
  const pastPeakDay = past.peakDay
  const pastTotalDays = Math.min(past.totalDays, MAX_LIFECYCLE_DAYS)
  const estimatedDaysToPeak = Math.max(0, pastPeakDay - currentDay)

  // 유사 근거 설명 (구체적 특성 기반)
  const simParts: string[] = []

  if (wCurve > 0 && curveSim >= 0.3) {
    simParts.push(`생명주기 곡선 ${Math.round(curveSim * 100)}% 일치`)
  }

  if (featureSim >= 0.3) {
    const cF = current.features
    const pF = past.features
    const details: string[] = []
    if (Math.abs(cF.growthRate - pF.growthRate) < 0.2) details.push('성장 속도')
    if (Math.abs(cF.newsIntensity - pF.newsIntensity) < 0.2) details.push('뉴스 집중도')
    if (Math.abs(cF.volatility - pF.volatility) < 0.2) details.push('변동성')
    if (Math.abs(cF.scoreLevel - pF.scoreLevel) < 0.2) details.push('점수 수준')
    if (details.length > 0) {
      simParts.push(`${details.join('·')} 패턴 유사`)
    } else {
      simParts.push(`종합 특성 유사도 ${Math.round(featureSim * 100)}%`)
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

  // 위치 분석
  let positionMsg: string
  if (pastTotalDays <= 3) {
    positionMsg = `과거 테마 데이터 ${pastTotalDays}일분으로 주기 비교 제한적.`
  } else if (currentDay >= pastTotalDays && pastTotalDays > 0) {
    positionMsg = `과거 ${past.name} 주기(${pastTotalDays}일) 초과, 새로운 전개 국면.`
  } else if (estimatedDaysToPeak > 0) {
    const progress = pastTotalDays > 0 ? Math.round((currentDay / pastTotalDays) * 100) : 0
    positionMsg = `과거 기준 피크까지 ~${estimatedDaysToPeak}일 (진행률 ${progress}%).`
  } else if (pastPeakDay > 0) {
    positionMsg = '피크 구간 진입 추정, 하락 전환 모니터링 필요.'
  } else {
    positionMsg = '초기 단계로 추가 데이터 수집 필요.'
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
