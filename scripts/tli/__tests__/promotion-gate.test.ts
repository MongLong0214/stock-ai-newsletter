import { describe, expect, it } from 'vitest'
import { evaluatePromotionGate } from '../level4/promotion-gate'

describe('level4 promotion gate', () => {
  it('passes when primary metric and all required guardrails satisfy the PRD', () => {
    const verdict = evaluatePromotionGate({
      calibrationArtifact: {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
      },
      weightArtifact: {
        source_surface: 'replay_equivalent',
        weight_version: 'w-2026-03-12',
      },
      requireWeightArtifact: true,
      driftStatus: 'ok',
      deltaPrecision: { mean: 0.004, lower: -0.004, upper: 0.013 },
      deltaBrier: { mean: -0.010, lower: -0.018, upper: 0.002 },
      deltaEce: { mean: -0.020, lower: -0.030, upper: 0.010 },
      deltaMrr: { mean: 0.006, lower: -0.002, upper: 0.015 },
      deltaNdcg: { mean: 0.005, lower: -0.002, upper: 0.013 },
      baselineGini: 0.24,
      candidateGini: 0.26,
      baselineCensoringRatio: 0.12,
      candidateCensoringRatio: 0.15,
      lowConfidenceServingRate: 0.35,
    })

    expect(verdict.passed).toBe(true)
    expect(verdict.reasons).toEqual([])
  })

  it('fails when mean precision improves but the lower bound misses the non-inferiority margin', () => {
    const verdict = evaluatePromotionGate({
      calibrationArtifact: {
        source_surface: 'v2_certification',
        calibration_version: 'cal-2026-03-12',
        ci_method: 'cluster_bootstrap',
        bootstrap_iterations: 1000,
      },
      driftStatus: 'ok',
      deltaPrecision: { mean: 0.003, lower: -0.015, upper: 0.011 },
      deltaBrier: { mean: 0, lower: -0.003, upper: 0.004 },
      deltaEce: { mean: 0, lower: -0.005, upper: 0.010 },
      deltaMrr: { mean: 0.001, lower: -0.003, upper: 0.007 },
      deltaNdcg: { mean: 0.002, lower: -0.003, upper: 0.008 },
      baselineGini: 0.20,
      candidateGini: 0.22,
      baselineCensoringRatio: 0.10,
      candidateCensoringRatio: 0.14,
      lowConfidenceServingRate: 0.28,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('precision_ci_lower')
  })

  it('fails closed when a certification-grade calibration artifact is missing', () => {
    const verdict = evaluatePromotionGate({
      calibrationArtifact: null,
      driftStatus: 'ok',
      deltaPrecision: { mean: 0.010, lower: 0.001, upper: 0.020 },
      deltaBrier: { mean: 0, lower: -0.002, upper: 0.003 },
      deltaEce: { mean: 0, lower: -0.004, upper: 0.008 },
      deltaMrr: { mean: 0.004, lower: 0.001, upper: 0.009 },
      deltaNdcg: { mean: 0.005, lower: 0.001, upper: 0.010 },
      baselineGini: 0.21,
      candidateGini: 0.23,
      baselineCensoringRatio: 0.10,
      candidateCensoringRatio: 0.12,
      lowConfidenceServingRate: 0.25,
    })

    expect(verdict.passed).toBe(false)
    expect(verdict.reasons).toContain('missing_calibration_artifact')
  })
})
