import { evaluatePromotionGate, type PromotionGateInput } from './promotion-gate'

interface CalibrationArtifactInput {
  source_surface: 'legacy_diagnostic' | 'v2_certification' | 'replay_equivalent'
  calibration_version: string
  ci_method: string
  bootstrap_iterations: number
  brier_score_before: number
  brier_score_after: number
  ece_before: number
  ece_after: number
}

interface WeightArtifactInput {
  source_surface: 'legacy_diagnostic' | 'v2_certification' | 'replay_equivalent'
  weight_version: string
  validation_metric_summary: Record<string, unknown>
}

export function resolveRequiredWeightArtifact<T extends WeightArtifactInput>(weightArtifact: T | null | undefined): T {
  if (!weightArtifact) {
    throw new Error('A certification-grade weight artifact is required for promotion')
  }
  return weightArtifact
}

interface DriftArtifactInput {
  drift_version?: string
  drift_status: 'stable' | 'hold' | 'observation_only'
  candidate_concentration_gini: number
  baseline_candidate_concentration_gini: number
  censoring_ratio: number
  baseline_censoring_ratio: number
  low_confidence_serving_rate: number
  auto_hold_enabled: boolean
  hold_report_date?: string | null
}

function readMetricSummary(
  summary: Record<string, unknown>,
  key: 'mrr' | 'ndcg' | 'precisionAt3',
) {
  const value = summary[key]
  if (
    typeof value !== 'object'
    || value == null
    || typeof (value as { meanDelta?: unknown }).meanDelta !== 'number'
    || typeof (value as { lower?: unknown }).lower !== 'number'
    || typeof (value as { upper?: unknown }).upper !== 'number'
  ) {
    throw new Error(`weight artifact validation_metric_summary.${key} is required`)
  }

  return value as { meanDelta: number; lower: number; upper: number }
}

export function extractPromotionMetricsFromArtifacts(input: {
  calibrationArtifact: CalibrationArtifactInput
  weightArtifact: WeightArtifactInput
  driftArtifact: DriftArtifactInput
}): PromotionGateInput {
  const mrr = readMetricSummary(input.weightArtifact.validation_metric_summary, 'mrr')
  const ndcg = readMetricSummary(input.weightArtifact.validation_metric_summary, 'ndcg')
  const precisionAt3 = readMetricSummary(input.weightArtifact.validation_metric_summary, 'precisionAt3')

  return {
    calibrationArtifact: input.calibrationArtifact,
    weightArtifact: {
      source_surface: input.weightArtifact.source_surface,
      weight_version: input.weightArtifact.weight_version,
    },
    requireWeightArtifact: true,
    driftStatus: input.driftArtifact.drift_status === 'hold' ? 'hold' : 'ok',
    deltaPrecision: {
      mean: precisionAt3.meanDelta,
      lower: precisionAt3.lower,
      upper: precisionAt3.upper,
    },
    deltaBrier: {
      mean: input.calibrationArtifact.brier_score_after - input.calibrationArtifact.brier_score_before,
      lower: input.calibrationArtifact.brier_score_after - input.calibrationArtifact.brier_score_before,
      upper: input.calibrationArtifact.brier_score_after - input.calibrationArtifact.brier_score_before,
    },
    deltaEce: {
      mean: input.calibrationArtifact.ece_after - input.calibrationArtifact.ece_before,
      lower: input.calibrationArtifact.ece_after - input.calibrationArtifact.ece_before,
      upper: input.calibrationArtifact.ece_after - input.calibrationArtifact.ece_before,
    },
    deltaMrr: { mean: mrr.meanDelta, lower: mrr.lower, upper: mrr.upper },
    deltaNdcg: { mean: ndcg.meanDelta, lower: ndcg.lower, upper: ndcg.upper },
    baselineGini: input.driftArtifact.baseline_candidate_concentration_gini,
    candidateGini: input.driftArtifact.candidate_concentration_gini,
    baselineCensoringRatio: input.driftArtifact.baseline_censoring_ratio,
    candidateCensoringRatio: input.driftArtifact.censoring_ratio,
    lowConfidenceServingRate: input.driftArtifact.low_confidence_serving_rate,
  }
}

export function buildArtifactBackedPromotionContext(input: {
  calibrationArtifact: CalibrationArtifactInput
  weightArtifact: WeightArtifactInput
  driftArtifact: DriftArtifactInput
}) {
  const gateInput = extractPromotionMetricsFromArtifacts(input)
  const gateVerdict = evaluatePromotionGate(gateInput)

  return {
    gateInput,
    gateVerdict: {
      passed: gateVerdict.passed,
      status: gateVerdict.status,
      summary: gateVerdict.summary,
      failureReasons: gateVerdict.failureReasons,
    },
    autoHold: {
      autoHoldEnabled: input.driftArtifact.auto_hold_enabled,
      holdState: input.driftArtifact.drift_status === 'hold' ? 'active' : input.driftArtifact.auto_hold_enabled ? 'inactive' : 'observation_only',
      holdReason: input.driftArtifact.drift_status === 'hold' ? gateVerdict.failureReasons[0] ?? 'drift_auto_hold_active' : null,
      holdReportDate: input.driftArtifact.hold_report_date ?? null,
    },
  }
}
