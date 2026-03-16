/**
 * TCAR-017: Forecast Ship Gate and Shadow Evaluator
 *
 * Tests for the ship gate verdict logic and shadow evaluation.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateShipGate,
  type ShipGateInput,
  type ShipGateVerdict,
  type BrierScoreSet,
  type SliceSummary,
} from '../../tli/forecast-ship-gate'
import { GATE_THRESHOLDS, ABSTENTION_THRESHOLDS } from '../../../lib/tli/forecast/types'

// --- helpers ---

const T = GATE_THRESHOLDS.forecastShip

const makeBrierSet = (overrides: Partial<BrierScoreSet> = {}): BrierScoreSet => ({
  baseline: { 5: 0.30, 10: 0.28, 20: 0.25 },
  candidate: { 5: 0.27, 10: 0.25, 20: 0.22 },
  ...overrides,
})

const makeSliceSummary = (overrides: Partial<SliceSummary> = {}): SliceSummary => ({
  liveQueries: 100,
  ece: 0.03,
  ...overrides,
})

const makePassingInput = (overrides: Partial<ShipGateInput> = {}): ShipGateInput => ({
  prospectiveShadowWeeks: 8,
  totalLiveQueries: 600,
  ibsBaseline: 0.20,
  ibsCandidate: 0.18,
  brierScores: makeBrierSet(),
  globalECE: 0.03,
  sliceSummaries: {
    Emerging: makeSliceSummary(),
    Growth: makeSliceSummary(),
    Peak: makeSliceSummary(),
    Decline: makeSliceSummary(),
  },
  confidenceGating: {
    analogSupport: ABSTENTION_THRESHOLDS.minAnalogSupport,
    candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini,
    top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight,
  },
  ...overrides,
})

// --- TCAR-017: ship gate evaluation ---

describe('TCAR-017: evaluateShipGate', () => {
  it('passes when all criteria are met', () => {
    const result = evaluateShipGate(makePassingInput())
    expect(result.cutoverRecommended).toBe(true)
    expect(result.failedCriteria).toHaveLength(0)
  })

  it('fails when prospective shadow weeks < minimum', () => {
    const result = evaluateShipGate(makePassingInput({
      prospectiveShadowWeeks: T.minProspectiveShadowWeeks - 1,
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('insufficient_shadow_weeks')
  })

  it('fails when total live queries < minimum', () => {
    const result = evaluateShipGate(makePassingInput({
      totalLiveQueries: T.minLiveQueries - 1,
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('insufficient_live_queries')
  })

  it('fails when any slice has fewer than minSliceLiveQueries', () => {
    const result = evaluateShipGate(makePassingInput({
      sliceSummaries: {
        Emerging: makeSliceSummary({ liveQueries: T.minSliceLiveQueries - 1 }),
        Growth: makeSliceSummary(),
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('insufficient_slice_live_queries')
  })

  it('fails when IBS relative improvement < threshold', () => {
    const result = evaluateShipGate(makePassingInput({
      ibsBaseline: 0.20,
      ibsCandidate: 0.195, // (0.20 - 0.195) / 0.20 = 0.025 < 0.05
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('insufficient_ibs_improvement')
  })

  it('passes when IBS relative improvement meets threshold exactly', () => {
    const result = evaluateShipGate(makePassingInput({
      ibsBaseline: 0.20,
      ibsCandidate: 0.19, // (0.20 - 0.19) / 0.20 = 0.05 exactly
    }))
    expect(result.failedCriteria).not.toContain('insufficient_ibs_improvement')
  })

  it('fails when fewer than brierMinImprovingHorizons improve', () => {
    // Only 1 of 3 horizons improves
    const result = evaluateShipGate(makePassingInput({
      brierScores: {
        baseline: { 5: 0.25, 10: 0.25, 20: 0.25 },
        candidate: { 5: 0.20, 10: 0.26, 20: 0.26 },
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('insufficient_brier_improvement')
  })

  it('passes when exactly brierMinImprovingHorizons improve', () => {
    // 2 of 3 horizons improve by >= 3%
    const result = evaluateShipGate(makePassingInput({
      brierScores: {
        baseline: { 5: 0.30, 10: 0.30, 20: 0.30 },
        candidate: { 5: 0.28, 10: 0.28, 20: 0.31 }, // 5&10 improve ~6.7%, 20 regresses
      },
    }))
    expect(result.failedCriteria).not.toContain('insufficient_brier_improvement')
  })

  it('fails when global ECE exceeds ceiling', () => {
    const result = evaluateShipGate(makePassingInput({
      globalECE: T.globalEceCeiling + 0.01,
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('global_ece_too_high')
  })

  it('fails when worst slice ECE exceeds ceiling', () => {
    const result = evaluateShipGate(makePassingInput({
      sliceSummaries: {
        Emerging: makeSliceSummary({ ece: T.worstSliceEceCeiling + 0.01 }),
        Growth: makeSliceSummary({ ece: 0.01 }),
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('worst_slice_ece_too_high')
  })

  it('accumulates all failures in failedCriteria', () => {
    const result = evaluateShipGate({
      prospectiveShadowWeeks: 1,
      totalLiveQueries: 10,
      ibsBaseline: 0.20,
      ibsCandidate: 0.20, // no improvement
      brierScores: {
        baseline: { 5: 0.25, 10: 0.25, 20: 0.25 },
        candidate: { 5: 0.26, 10: 0.26, 20: 0.26 }, // all regress
      },
      globalECE: 0.10,
      sliceSummaries: {
        Emerging: makeSliceSummary({ liveQueries: 10, ece: 0.15 }),
      },
      confidenceGating: {
        analogSupport: 0,
        candidateConcentrationGini: 1.0,
        top1AnalogWeight: 1.0,
      },
    })
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria.length).toBeGreaterThanOrEqual(5)
  })

  it('verdict artifact contains required metadata', () => {
    const result = evaluateShipGate(makePassingInput())
    expect(result).toHaveProperty('cutoverRecommended')
    expect(result).toHaveProperty('failedCriteria')
    expect(result).toHaveProperty('metrics')
    expect(result.metrics).toHaveProperty('prospectiveShadowWeeks')
    expect(result.metrics).toHaveProperty('totalLiveQueries')
    expect(result.metrics).toHaveProperty('ibsRelativeImprovement')
    expect(result.metrics).toHaveProperty('brierImprovingHorizons')
    expect(result.metrics).toHaveProperty('globalECE')
    expect(result.metrics).toHaveProperty('worstSliceECE')
  })

  it('handles edge case where ibsBaseline is 0', () => {
    const result = evaluateShipGate(makePassingInput({
      ibsBaseline: 0,
      ibsCandidate: 0,
    }))
    // When baseline is 0, relative improvement is undefined — fail safely
    expect(result.failedCriteria).toContain('insufficient_ibs_improvement')
  })

  it('fails when slice summaries are empty', () => {
    const result = evaluateShipGate(makePassingInput({
      sliceSummaries: {},
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('no_slice_coverage')
  })

  // --- TCAR-017: Confidence gating ---

  it('passes when confidence gating criteria are met', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: ABSTENTION_THRESHOLDS.minAnalogSupport,
        candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini,
        top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight,
      },
    }))
    expect(result.cutoverRecommended).toBe(true)
    expect(result.failedCriteria).not.toContain('confidence_gating_not_met')
  })

  it('fails when analogSupport < minAnalogSupport', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: ABSTENTION_THRESHOLDS.minAnalogSupport - 1,
        candidateConcentrationGini: 0.50,
        top1AnalogWeight: 0.30,
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('confidence_gating_not_met')
  })

  it('fails when candidateConcentrationGini > max', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: 10,
        candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini + 0.01,
        top1AnalogWeight: 0.30,
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('confidence_gating_not_met')
  })

  it('fails when top1AnalogWeight > max', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: 10,
        candidateConcentrationGini: 0.50,
        top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight + 0.01,
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('confidence_gating_not_met')
  })

  it('fails when confidence gating thresholds are not met (fail-closed)', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: 0,
        candidateConcentrationGini: 1.0,
        top1AnalogWeight: 1.0,
      },
    }))
    expect(result.cutoverRecommended).toBe(false)
    expect(result.failedCriteria).toContain('confidence_gating_not_met')
  })

  it('includes confidence gating result in metrics', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: 10,
        candidateConcentrationGini: 0.50,
        top1AnalogWeight: 0.30,
      },
    }))
    expect(result.metrics.confidenceGatingPassed).toBe(true)
  })

  it('metrics show confidence gating failed', () => {
    const result = evaluateShipGate(makePassingInput({
      confidenceGating: {
        analogSupport: 2,
        candidateConcentrationGini: 0.80,
        top1AnalogWeight: 0.50,
      },
    }))
    expect(result.metrics.confidenceGatingPassed).toBe(false)
  })
})
