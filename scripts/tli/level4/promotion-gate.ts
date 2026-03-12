import {
  isCertificationCalibrationArtifact,
  isCertificationSourceSurface,
  type Level4CalibrationArtifact,
  type Level4SourceSurface,
} from '@/lib/tli/comparison/level4-types'

export interface PromotionMetricDelta {
  mean: number
  lower: number
  upper: number
}

export interface PromotionWeightArtifact {
  source_surface: Level4SourceSurface
  weight_version: string
}

export interface PromotionGateInput {
  calibrationArtifact: Pick<Level4CalibrationArtifact, 'source_surface' | 'calibration_version' | 'ci_method' | 'bootstrap_iterations'> | null
  weightArtifact?: PromotionWeightArtifact | null
  requireWeightArtifact?: boolean
  driftStatus?: 'stable' | 'hold' | 'observation_only' | 'ok'
  deltaPrecision: PromotionMetricDelta
  deltaBrier: PromotionMetricDelta
  deltaEce: PromotionMetricDelta
  deltaMrr: PromotionMetricDelta
  deltaNdcg: PromotionMetricDelta
  baselineGini: number
  candidateGini: number
  baselineCensoringRatio: number
  candidateCensoringRatio: number
  lowConfidenceServingRate: number
}

export interface PromotionGateVerdict {
  passed: boolean
  status: 'passed' | 'failed' | 'held'
  summary: string
  failureReasons: string[]
  reasons: string[]
}

export const PROMOTION_GUARDRAILS = {
  precisionLowerBound: -0.01,
  brierUpperBound: 0.005,
  eceUpperBound: 0.02,
  mrrLowerBound: -0.005,
  ndcgLowerBound: -0.005,
  giniDeltaUpperBound: 0.03,
  censoringDeltaUpperBound: 0.05,
  lowConfidenceServingRateUpperBound: 0.40,
} as const

function buildSummary(reasons: string[]) {
  return reasons.length === 0
    ? 'all release gates passed'
    : `release blocked: ${reasons.join(', ')}`
}

export function evaluatePromotionGate(input: PromotionGateInput): PromotionGateVerdict {
  const reasons: string[] = []

  if (!input.calibrationArtifact || !isCertificationCalibrationArtifact(input.calibrationArtifact)) {
    reasons.push('missing_calibration_artifact')
  }

  if (input.requireWeightArtifact) {
    if (!input.weightArtifact || !input.weightArtifact.weight_version || !isCertificationSourceSurface(input.weightArtifact.source_surface)) {
      reasons.push('missing_weight_artifact')
    }
  }

  if (input.driftStatus === 'hold') {
    reasons.push('drift_auto_hold_active')
  }
  if (input.deltaPrecision.lower <= PROMOTION_GUARDRAILS.precisionLowerBound) {
    reasons.push('precision_ci_lower')
  }
  if (input.deltaBrier.upper > PROMOTION_GUARDRAILS.brierUpperBound) {
    reasons.push('brier_ci_upper')
  }
  if (input.deltaEce.upper > PROMOTION_GUARDRAILS.eceUpperBound) {
    reasons.push('ece_ci_upper')
  }
  if (input.deltaMrr.lower <= PROMOTION_GUARDRAILS.mrrLowerBound) {
    reasons.push('mrr_ci_lower')
  }
  if (input.deltaNdcg.lower <= PROMOTION_GUARDRAILS.ndcgLowerBound) {
    reasons.push('ndcg_ci_lower')
  }
  if (input.candidateGini > input.baselineGini + PROMOTION_GUARDRAILS.giniDeltaUpperBound) {
    reasons.push('candidate_concentration_gini')
  }
  if (input.candidateCensoringRatio > input.baselineCensoringRatio + PROMOTION_GUARDRAILS.censoringDeltaUpperBound) {
    reasons.push('censoring_ratio')
  }
  if (input.lowConfidenceServingRate > PROMOTION_GUARDRAILS.lowConfidenceServingRateUpperBound) {
    reasons.push('low_confidence_serving_rate')
  }

  return {
    passed: reasons.length === 0,
    status: reasons.includes('drift_auto_hold_active') ? 'held' : reasons.length === 0 ? 'passed' : 'failed',
    summary: buildSummary(reasons),
    failureReasons: reasons,
    reasons,
  }
}
