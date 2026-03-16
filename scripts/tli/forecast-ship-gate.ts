/**
 * TCAR-017: Forecast Ship Gate and Shadow Evaluator
 *
 * Evaluates whether a forecast model candidate should be promoted to production.
 * Uses GATE_THRESHOLDS.forecastShip for all threshold checks.
 * All functions are PURE (no DB calls).
 */
import { GATE_THRESHOLDS, ABSTENTION_THRESHOLDS } from '../../lib/tli/forecast/types'
import type { ForecastHorizon } from '../../lib/tli/forecast/types'

// --- Types ---

export interface BrierScoreSet {
  baseline: Record<ForecastHorizon, number>
  candidate: Record<ForecastHorizon, number>
}

export interface SliceSummary {
  liveQueries: number
  ece: number
}

export interface ShipGateInput {
  prospectiveShadowWeeks: number
  totalLiveQueries: number
  ibsBaseline: number
  ibsCandidate: number
  brierScores: BrierScoreSet
  globalECE: number
  sliceSummaries: Record<string, SliceSummary>
  confidenceGating: {
    analogSupport: number
    candidateConcentrationGini: number
    top1AnalogWeight: number
  }
}

export type ShipGateFailure =
  | 'insufficient_shadow_weeks'
  | 'insufficient_live_queries'
  | 'no_slice_coverage'
  | 'insufficient_slice_live_queries'
  | 'insufficient_ibs_improvement'
  | 'insufficient_brier_improvement'
  | 'global_ece_too_high'
  | 'worst_slice_ece_too_high'
  | 'confidence_gating_not_met'

export interface ShipGateMetrics {
  prospectiveShadowWeeks: number
  totalLiveQueries: number
  ibsRelativeImprovement: number
  brierImprovingHorizons: number
  globalECE: number
  worstSliceECE: number
  confidenceGatingPassed: boolean
}

export interface ShipGateVerdict {
  cutoverRecommended: boolean
  failedCriteria: ShipGateFailure[]
  metrics: ShipGateMetrics
}

// --- Ship Gate Evaluation ---

const T = GATE_THRESHOLDS.forecastShip

export const evaluateShipGate = (input: ShipGateInput): ShipGateVerdict => {
  const failedCriteria: ShipGateFailure[] = []

  // 1. Prospective shadow weeks
  if (input.prospectiveShadowWeeks < T.minProspectiveShadowWeeks) {
    failedCriteria.push('insufficient_shadow_weeks')
  }

  // 2. Total live queries
  if (input.totalLiveQueries < T.minLiveQueries) {
    failedCriteria.push('insufficient_live_queries')
  }

  // 3. Slice coverage existence
  const sliceNames = Object.keys(input.sliceSummaries)
  if (sliceNames.length === 0) {
    failedCriteria.push('no_slice_coverage')
  }

  // 4. Per-slice live queries
  const hasInsufficientSlice = sliceNames.some(
    (name) => input.sliceSummaries[name].liveQueries < T.minSliceLiveQueries,
  )
  if (hasInsufficientSlice) {
    failedCriteria.push('insufficient_slice_live_queries')
  }

  // 5. IBS relative improvement
  const ibsRelativeImprovement = computeIBSRelativeImprovement(
    input.ibsBaseline,
    input.ibsCandidate,
  )
  if (ibsRelativeImprovement < T.ibsRelativeImprovement) {
    failedCriteria.push('insufficient_ibs_improvement')
  }

  // 6. Brier improvement across horizons
  const brierImprovingHorizons = countImprovingHorizons(input.brierScores)
  if (brierImprovingHorizons < T.brierMinImprovingHorizons) {
    failedCriteria.push('insufficient_brier_improvement')
  }

  // 7. Global ECE
  if (input.globalECE > T.globalEceCeiling) {
    failedCriteria.push('global_ece_too_high')
  }

  // 8. Worst slice ECE
  const worstSliceECE = computeWorstSliceECE(input.sliceSummaries)
  if (worstSliceECE > T.worstSliceEceCeiling) {
    failedCriteria.push('worst_slice_ece_too_high')
  }

  // 9. Confidence gating (required — fail-closed)
  const cg = input.confidenceGating
  const confidenceGatingPassed =
    cg.analogSupport >= ABSTENTION_THRESHOLDS.minAnalogSupport &&
    cg.candidateConcentrationGini <= ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini &&
    cg.top1AnalogWeight <= ABSTENTION_THRESHOLDS.maxTop1AnalogWeight
  if (!confidenceGatingPassed) {
    failedCriteria.push('confidence_gating_not_met')
  }

  const metrics: ShipGateMetrics = {
    prospectiveShadowWeeks: input.prospectiveShadowWeeks,
    totalLiveQueries: input.totalLiveQueries,
    ibsRelativeImprovement,
    brierImprovingHorizons,
    globalECE: input.globalECE,
    worstSliceECE,
    confidenceGatingPassed,
  }

  return {
    cutoverRecommended: failedCriteria.length === 0,
    failedCriteria,
    metrics,
  }
}

// --- Internal helpers ---

const computeIBSRelativeImprovement = (
  baseline: number,
  candidate: number,
): number => {
  if (baseline <= 0) return 0
  return (baseline - candidate) / baseline
}

const countImprovingHorizons = (brierScores: BrierScoreSet): number => {
  const horizons: ForecastHorizon[] = [5, 10, 20]
  let improvingCount = 0

  for (const h of horizons) {
    const baselineScore = brierScores.baseline[h]
    const candidateScore = brierScores.candidate[h]

    if (baselineScore <= 0) continue

    const relativeImprovement = (baselineScore - candidateScore) / baselineScore
    if (relativeImprovement >= T.brierImprovementThreshold) {
      improvingCount++
    }
  }

  return improvingCount
}

const computeWorstSliceECE = (
  sliceSummaries: Record<string, SliceSummary>,
): number => {
  const sliceNames = Object.keys(sliceSummaries)
  if (sliceNames.length === 0) return 0

  let worst = 0
  for (const name of sliceNames) {
    if (sliceSummaries[name].ece > worst) {
      worst = sliceSummaries[name].ece
    }
  }
  return worst
}
