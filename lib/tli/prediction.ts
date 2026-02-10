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

function derivePhase(daysSinceSpike: number, avgPeakDay: number, avgTotalDays: number): Phase {
  if (avgPeakDay <= 0 || avgTotalDays <= 0) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.7) return 'pre-peak'
  if (daysSinceSpike < avgPeakDay * 0.95) return 'near-peak'
  if (daysSinceSpike <= avgPeakDay * 1.1) return 'at-peak'
  if (daysSinceSpike < avgTotalDays * 0.8) return 'post-peak'
  return 'declining'
}

function deriveMomentum(estimatedDaysToPeak: number, avgTotalDays: number): Momentum {
  if (avgTotalDays <= 0) return 'stable'
  const ratio = estimatedDaysToPeak / avgTotalDays
  if (ratio > 0.3) return 'accelerating'
  if (ratio > 0.1) return 'stable'
  return 'decelerating'
}

function deriveRisk(phase: Phase, confidence: ConfidenceLevel): RiskLevel {
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
  const midIdx = Math.floor((sorted.length - 1) / 2)
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
): PredictionResult | null {
  if (!comparisons.length) return null

  // Quality gate: reject if all comparisons have trivially short cycles
  if (comparisons.every(c => c.pastTotalDays < 2)) return null

  // KST 보정 적용 (UTC+9)
  const nowKST = today ? new Date(today).getTime() + KST_OFFSET_MS : Date.now() + KST_OFFSET_MS
  const spikeKST = firstSpikeDate ? new Date(firstSpikeDate).getTime() + KST_OFFSET_MS : 0
  const daysSinceSpike = firstSpikeDate
    ? Math.max(0, Math.floor((nowKST - spikeKST) / 86_400_000))
    : 0

  const avgSimilarity = comparisons.reduce((s, c) => s + c.similarity, 0) / comparisons.length

  const avgPeakDay = Math.round(weightedAvg(comparisons, c => c.pastPeakDay))
  const avgTotalDays = Math.min(Math.round(weightedAvg(comparisons, c => c.pastTotalDays)), 365)

  // Quality gate: reject garbage predictions
  if (avgTotalDays < 3) return null

  const positivePeakComps = comparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak = positivePeakComps.length > 0
    ? Math.round(weightedAvg(positivePeakComps, c => c.estimatedDaysToPeak))
    : 0

  const currentProgress = avgTotalDays > 0 ? clamp((daysSinceSpike / avgTotalDays) * 100, 0, 100) : 0
  const peakProgress = avgTotalDays > 0 ? clamp((avgPeakDay / avgTotalDays) * 100, 0, 100) : 0

  const comparisonCount = comparisons.length
  const confidence = deriveConfidence(comparisonCount, avgSimilarity)
  const phase = derivePhase(daysSinceSpike, avgPeakDay, avgTotalDays)
  const momentum = deriveMomentum(avgDaysToPeak, avgTotalDays)
  const riskLevel = deriveRisk(phase, confidence)
  const scenarios = buildScenarios(comparisons)

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
    phaseMessage: buildPhaseMessage(phase, avgDaysToPeak),
    riskLevel,
    riskMessage: buildRiskMessage(riskLevel),
    keyInsight: buildKeyInsight(phase, avgDaysToPeak),
  }
}
