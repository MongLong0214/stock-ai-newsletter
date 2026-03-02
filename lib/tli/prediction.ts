/** 생명주기 참고 지표 계산 모듈 v2 — Stage-derived Phase */

import { KST_OFFSET_MS } from './date-utils'
import { computePredictionIntervals } from './prediction-bootstrap'
import {
  buildPhaseMessage,
  buildKeyInsight,
  weightedAvg,
  clamp,
  deriveConfidence,
  deriveMomentum,
  deriveRisk,
  computeStageConfidence,
  buildScenarios,
  derivePhaseFallback,
  STAGE_TO_PHASE,
} from './prediction-helpers'
import type { Stage } from './types'

// Re-export types for backward compat (consumers import from prediction.ts)
export type {
  Phase,
  RiskLevel,
  Momentum,
  Scenario,
  PredictionResult,
  ComparisonInput,
  ConfidenceLevel,
} from './prediction-helpers'

/**
 * 생명주기 참고 지표 계산
 * @param stage Stage (제공 시 Phase가 Stage에서 직접 파생)
 */
export function calculatePrediction(
  firstSpikeDate: string | null,
  comparisons: import('./prediction-helpers').ComparisonInput[],
  today?: string,
  score?: number,
  stage?: Stage,
): import('./prediction-helpers').PredictionResult | null {
  const validComparisons = comparisons.filter(c => c.pastTotalDays >= 14 && c.pastPeakDay >= 3)
  if (validComparisons.length < 3) return null

  const now = today ? new Date(today).getTime() : Date.now() + KST_OFFSET_MS
  const spike = firstSpikeDate ? new Date(firstSpikeDate).getTime() : 0
  const daysSinceSpike = firstSpikeDate
    ? Math.min(365, Math.max(0, Math.floor((now - spike) / 86_400_000)))
    : 0

  const avgSimilarity = validComparisons.reduce((s, c) => s + c.similarity, 0) / validComparisons.length
  if (avgSimilarity < 0.40) return null

  const avgPeakDay = Math.round(weightedAvg(validComparisons, c => c.pastPeakDay))
  const avgTotalDays = Math.min(Math.round(weightedAvg(validComparisons, c => c.pastTotalDays)), 365)

  if (avgTotalDays < 3) return null

  const positivePeakComps = validComparisons.filter(c => c.estimatedDaysToPeak > 0)
  const avgDaysToPeak = positivePeakComps.length > 0
    ? Math.round(weightedAvg(positivePeakComps, c => c.estimatedDaysToPeak))
    : 0

  const currentProgress = avgTotalDays > 0 ? clamp((daysSinceSpike / avgTotalDays) * 100, 0, 100) : 0
  const peakProgress = avgTotalDays > 0 ? clamp((avgPeakDay / avgTotalDays) * 100, 0, 100) : 0

  const comparisonCount = validComparisons.length
  const confidence = deriveConfidence(comparisonCount, avgSimilarity)

  const phase = stage
    ? STAGE_TO_PHASE[stage]
    : derivePhaseFallback(daysSinceSpike, avgPeakDay, avgTotalDays, score)

  const momentum = deriveMomentum(validComparisons, daysSinceSpike)
  const riskLevel = deriveRisk(stage, phase, confidence)
  const scenarios = buildScenarios(validComparisons)
  const stageConfidence = computeStageConfidence(phase, momentum, score, avgPeakDay, daysSinceSpike)

  const predictionIntervals = computePredictionIntervals(
    validComparisons.map(c => ({
      pastPeakDay: c.pastPeakDay,
      pastTotalDays: c.pastTotalDays,
      similarity: c.similarity,
    }))
  )

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
    keyInsight: buildKeyInsight(phase, avgDaysToPeak, score),
    stageConfidence,
    predictionIntervals: {
      peakDay: predictionIntervals.peakDayCI,
      totalDays: predictionIntervals.totalDaysCI,
    },
  }
}
