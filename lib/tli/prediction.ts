import { KST_OFFSET_MS } from './date-utils'
import { buildRiskMessage, buildPhaseMessage, buildKeyInsight } from './prediction-helpers'

export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type Phase = 'pre-peak' | 'near-peak' | 'at-peak' | 'post-peak' | 'declining'
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'
export type Momentum = 'accelerating' | 'stable' | 'decelerating'

export interface Scenario {
  themeName: string
  peakDay: number
  totalDays: number
  similarity: number
}

export interface PredictionResult {
  daysSinceSpike: number
  confidence: ConfidenceLevel
  comparisonCount: number
  avgSimilarity: number

  avgPeakDay: number
  avgTotalDays: number
  avgDaysToPeak: number
  currentProgress: number
  peakProgress: number

  scenarios: {
    best: Scenario
    median: Scenario
    worst: Scenario
  }

  phase: Phase
  momentum: Momentum
  phaseMessage: string

  riskLevel: RiskLevel
  riskMessage: string

  keyInsight: string
}

export interface ComparisonInput {
  pastTheme: string
  similarity: number
  estimatedDaysToPeak: number
  pastPeakDay: number
  pastTotalDays: number
}

function weightedAvg(items: ComparisonInput[], getter: (c: ComparisonInput) => number): number {
  const totalWeight = items.reduce((s, c) => s + c.similarity, 0)
  if (totalWeight <= 0) return 0
  return items.reduce((s, c) => s + getter(c) * c.similarity, 0) / totalWeight
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function deriveConfidence(count: number, avgSimilarity: number): ConfidenceLevel {
  if (count >= 3 && avgSimilarity >= 0.55) return 'high'
  if (count >= 2 && avgSimilarity >= 0.40) return 'medium'
  return 'low'
}

function derivePhase(daysSinceSpike: number, avgPeakDay: number, avgTotalDays: number, score?: number): Phase {
  // 점수가 있으면 1차 신호로 사용 (테마 자체 상태가 가장 정확)
  if (score !== undefined && score > 0) {
    if (score >= 75) return 'at-peak'
    if (score >= 55) return 'near-peak'
    if (score < 25) {
      if (avgPeakDay > 0 && daysSinceSpike > avgPeakDay) return 'declining'
      return 'pre-peak'
    }
    // 중간 점수(25-54): 비교 데이터로 세분화 (peakDay 최소 3일 이상만 신뢰)
    if (avgPeakDay >= 3 && avgTotalDays > 0) {
      if (daysSinceSpike > avgTotalDays * 0.8) return 'declining'
      if (daysSinceSpike > avgPeakDay) return 'post-peak'
      if (daysSinceSpike > avgPeakDay * 0.7) return 'near-peak'
    }
    return 'pre-peak'
  }

  // 폴백: 비교 데이터만으로 추정
  if (avgPeakDay <= 0 || avgTotalDays <= 0) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.7) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.95) return 'near-peak'
  if (daysSinceSpike <= avgPeakDay * 1.1) return 'at-peak'
  if (daysSinceSpike < avgTotalDays * 0.8) return 'post-peak'
  return 'declining'
}

function deriveMomentum(estimatedDaysToPeak: number, avgTotalDays: number, score?: number): Momentum {
  // 점수 기반 (높은 점수만 — 낮은 점수는 방향 불명확하므로 비교 데이터 폴백)
  if (score !== undefined && score >= 65) return 'accelerating'
  if (score !== undefined && score >= 35) return 'stable'
  // 낮은 점수(< 35) 또는 score 없음: 비교 데이터 기반 판단
  if (avgTotalDays <= 0) return 'stable'
  const ratio = estimatedDaysToPeak / avgTotalDays
  if (ratio > 0.3) return 'accelerating'
  if (ratio > 0.1) return 'stable'
  return 'decelerating'
}

function deriveRisk(phase: Phase, confidence: ConfidenceLevel, score?: number): RiskLevel {
  // 점수 기반 (높은 점수만 — 낮은 점수는 상승/하락 구분 불가하므로 phase 폴백)
  if (score !== undefined && score >= 80) return 'high'
  if (score !== undefined && score >= 60) return 'moderate'
  if (score !== undefined && score >= 35) return 'low'
  // 낮은 점수(< 35) 또는 score 없음: phase 기반 판단
  if (phase === 'declining') return 'critical'
  if (phase === 'post-peak' || phase === 'at-peak') return 'high'
  if (phase === 'near-peak') return 'moderate'
  if (phase === 'pre-peak' && confidence !== 'low') return 'low'
  return 'moderate'
}

function buildScenarios(comparisons: ComparisonInput[]): { best: Scenario; median: Scenario; worst: Scenario } {
  const sorted = [...comparisons].sort((a, b) => a.pastTotalDays - b.pastTotalDays)
  const toScenario = (c: ComparisonInput): Scenario => ({
    themeName: c.pastTheme,
    peakDay: c.pastPeakDay,
    totalDays: c.pastTotalDays,
    similarity: c.similarity,
  })
  const midIdx = Math.floor(sorted.length / 2)
  return {
    best: toScenario(sorted[0]),
    median: toScenario(sorted[midIdx]),
    worst: toScenario(sorted[sorted.length - 1]),
  }
}

export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: ComparisonInput[],
  today?: string,
  score?: number,
): PredictionResult | null {
  // 개별 비교군 품질 필터: pastTotalDays < 14 또는 pastPeakDay < 3 제외
  const validComparisons = comparisons.filter(c => c.pastTotalDays >= 14 && c.pastPeakDay >= 3)
  if (validComparisons.length < 2) return null

  // today가 KST 날짜 문자열이면 그대로, 없으면 현재 KST 시각 사용
  const now = today ? new Date(today).getTime() : Date.now() + KST_OFFSET_MS
  const spike = firstSpikeDate ? new Date(firstSpikeDate).getTime() : 0
  const daysSinceSpike = firstSpikeDate
    ? Math.min(365, Math.max(0, Math.floor((now - spike) / 86_400_000)))
    : 0

  const avgSimilarity = validComparisons.reduce((s, c) => s + c.similarity, 0) / validComparisons.length
  if (avgSimilarity < 0.40) return null

  const avgPeakDay = Math.round(weightedAvg(validComparisons, c => c.pastPeakDay))
  const avgTotalDays = Math.min(Math.round(weightedAvg(validComparisons, c => c.pastTotalDays)), 365)

  // 품질 게이트: 가중평균 주기가 너무 짧으면 거부
  if (avgTotalDays < 3) return null

  const positivePeakComps = validComparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak = positivePeakComps.length > 0
    ? Math.round(weightedAvg(positivePeakComps, c => c.estimatedDaysToPeak))
    : 0

  const currentProgress = avgTotalDays > 0 ? clamp((daysSinceSpike / avgTotalDays) * 100, 0, 100) : 0
  const peakProgress = avgTotalDays > 0 ? clamp((avgPeakDay / avgTotalDays) * 100, 0, 100) : 0

  const comparisonCount = validComparisons.length
  const confidence = deriveConfidence(comparisonCount, avgSimilarity)
  const phase = derivePhase(daysSinceSpike, avgPeakDay, avgTotalDays, score)
  const momentum = deriveMomentum(avgDaysToPeak, avgTotalDays, score)
  const riskLevel = deriveRisk(phase, confidence, score)
  const scenarios = buildScenarios(validComparisons)

  return {
    daysSinceSpike,
    confidence,
    comparisonCount,
    avgSimilarity,
    avgPeakDay,
    avgTotalDays,
    avgDaysToPeak,
    currentProgress,
    peakProgress,
    scenarios,
    phase,
    momentum,
    phaseMessage: buildPhaseMessage(phase, avgDaysToPeak, score),
    riskLevel,
    riskMessage: buildRiskMessage(riskLevel),
    keyInsight: buildKeyInsight(phase, avgDaysToPeak, score),
  }
}
