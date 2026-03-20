/**
 * TCAR-016: Calibration, Abstention, Evidence-Quality Scoring
 *
 * Tests for ECE computation, abstention logic, and evidence-quality scoring.
 */
import { describe, it, expect } from 'vitest'
import {
  computeECE,
  computeSliceECE,
  type CalibrationBin,
} from '../forecast/calibration'
import {
  computeEvidenceQualityScore,
  shouldAbstain,
  type EvidenceInput,
  type AbstentionInput,
} from '../forecast/evidence-quality'
import { ABSTENTION_THRESHOLDS, GATE_THRESHOLDS } from '../forecast/types'

// --- helpers ---

const makeEvidenceInput = (overrides: Partial<EvidenceInput> = {}): EvidenceInput => ({
  analogSupportCount: 10,
  candidateConcentrationGini: 0.3,
  top1AnalogWeight: 0.2,
  analogFuturePathCoverage: 0.8,
  mismatchCount: 0,
  ...overrides,
})

const makeAbstentionInput = (overrides: Partial<AbstentionInput> = {}): AbstentionInput => ({
  analogSupportCount: 10,
  candidateConcentrationGini: 0.3,
  top1AnalogWeight: 0.2,
  ...overrides,
})

// --- TCAR-016: ECE computation ---

describe('TCAR-016: computeECE', () => {
  it('returns 0 for perfectly calibrated bins', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.2, actualOutcome: 0.2, count: 100 },
      { predictedProb: 0.5, actualOutcome: 0.5, count: 100 },
      { predictedProb: 0.8, actualOutcome: 0.8, count: 100 },
    ]
    const result = computeECE(bins)
    expect(result.ece).toBeCloseTo(0, 5)
  })

  it('computes non-zero ECE for miscalibrated bins', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.3, actualOutcome: 0.6, count: 50 },
      { predictedProb: 0.7, actualOutcome: 0.4, count: 50 },
    ]
    const result = computeECE(bins)
    // |0.3-0.6|*0.5 + |0.7-0.4|*0.5 = 0.15 + 0.15 = 0.30
    expect(result.ece).toBeCloseTo(0.30, 5)
  })

  it('weights bins by their sample count', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.5, actualOutcome: 0.5, count: 990 }, // perfect
      { predictedProb: 0.9, actualOutcome: 0.1, count: 10 },   // terrible but tiny
    ]
    const result = computeECE(bins)
    // |0.9-0.1| * (10/1000) = 0.008
    expect(result.ece).toBeCloseTo(0.008, 3)
  })

  it('returns 0 for empty bins', () => {
    const result = computeECE([])
    expect(result.ece).toBe(0)
    expect(result.binCount).toBe(0)
  })

  it('ignores bins with count 0', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.5, actualOutcome: 0.5, count: 100 },
      { predictedProb: 0.9, actualOutcome: 0.1, count: 0 },
    ]
    const result = computeECE(bins)
    expect(result.ece).toBeCloseTo(0, 5)
    expect(result.binCount).toBe(1)
  })

  it('clamps ECE to [0, 1] range', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.0, actualOutcome: 1.0, count: 100 },
    ]
    const result = computeECE(bins)
    expect(result.ece).toBeLessThanOrEqual(1)
    expect(result.ece).toBeGreaterThanOrEqual(0)
  })

  it('result contains totalSamples and binCount', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: 0.3, actualOutcome: 0.3, count: 50 },
      { predictedProb: 0.7, actualOutcome: 0.7, count: 150 },
    ]
    const result = computeECE(bins)
    expect(result.totalSamples).toBe(200)
    expect(result.binCount).toBe(2)
  })
})

// --- TCAR-016: per-slice ECE ---

describe('TCAR-016: computeSliceECE', () => {
  it('computes ECE for each slice', () => {
    const slices: Record<string, CalibrationBin[]> = {
      Emerging: [
        { predictedProb: 0.5, actualOutcome: 0.5, count: 100 },
      ],
      Growth: [
        { predictedProb: 0.8, actualOutcome: 0.5, count: 100 },
      ],
    }
    const result = computeSliceECE(slices)
    expect(result.sliceResults.Emerging.ece).toBeCloseTo(0, 5)
    expect(result.sliceResults.Growth.ece).toBeCloseTo(0.3, 5)
  })

  it('identifies worst slice', () => {
    const slices: Record<string, CalibrationBin[]> = {
      Emerging: [{ predictedProb: 0.5, actualOutcome: 0.5, count: 100 }],
      Growth: [{ predictedProb: 0.8, actualOutcome: 0.2, count: 100 }],
      Peak: [{ predictedProb: 0.7, actualOutcome: 0.4, count: 100 }],
    }
    const result = computeSliceECE(slices)
    expect(result.worstSliceName).toBe('Growth')
    expect(result.worstSliceECE).toBeCloseTo(0.6, 5)
  })

  it('returns empty result for no slices', () => {
    const result = computeSliceECE({})
    expect(result.worstSliceECE).toBe(0)
    expect(result.worstSliceName).toBe('')
    expect(Object.keys(result.sliceResults)).toHaveLength(0)
  })

  it('passes global ECE threshold check', () => {
    const slices: Record<string, CalibrationBin[]> = {
      Emerging: [{ predictedProb: 0.5, actualOutcome: 0.52, count: 100 }],
    }
    const result = computeSliceECE(slices)
    expect(result.worstSliceECE).toBeLessThanOrEqual(GATE_THRESHOLDS.forecastShip.worstSliceEceCeiling)
  })
})

// --- TCAR-016: evidence-quality scoring ---

describe('TCAR-016: computeEvidenceQualityScore', () => {
  it('returns high score for strong evidence', () => {
    const input = makeEvidenceInput({
      analogSupportCount: 20,
      candidateConcentrationGini: 0.2,
      top1AnalogWeight: 0.1,
      analogFuturePathCoverage: 1.0,
      mismatchCount: 0,
    })
    const score = computeEvidenceQualityScore(input)
    expect(score).toBeGreaterThan(0.7)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('returns low score for weak evidence', () => {
    const input = makeEvidenceInput({
      analogSupportCount: 2,
      candidateConcentrationGini: 0.8,
      top1AnalogWeight: 0.5,
      analogFuturePathCoverage: 0.2,
      mismatchCount: 5,
    })
    const score = computeEvidenceQualityScore(input)
    expect(score).toBeLessThan(0.4)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('is bounded between 0 and 1', () => {
    const extremeLow = computeEvidenceQualityScore(makeEvidenceInput({
      analogSupportCount: 0,
      candidateConcentrationGini: 1,
      top1AnalogWeight: 1,
      analogFuturePathCoverage: 0,
      mismatchCount: 100,
    }))
    const extremeHigh = computeEvidenceQualityScore(makeEvidenceInput({
      analogSupportCount: 100,
      candidateConcentrationGini: 0,
      top1AnalogWeight: 0,
      analogFuturePathCoverage: 1,
      mismatchCount: 0,
    }))
    expect(extremeLow).toBeGreaterThanOrEqual(0)
    expect(extremeHigh).toBeLessThanOrEqual(1)
  })

  it('penalizes high concentration gini', () => {
    const lowGini = computeEvidenceQualityScore(makeEvidenceInput({ candidateConcentrationGini: 0.1 }))
    const highGini = computeEvidenceQualityScore(makeEvidenceInput({ candidateConcentrationGini: 0.9 }))
    expect(lowGini).toBeGreaterThan(highGini)
  })

  it('penalizes high top1 analog weight', () => {
    const lowWeight = computeEvidenceQualityScore(makeEvidenceInput({ top1AnalogWeight: 0.1 }))
    const highWeight = computeEvidenceQualityScore(makeEvidenceInput({ top1AnalogWeight: 0.8 }))
    expect(lowWeight).toBeGreaterThan(highWeight)
  })
})

// --- TCAR-016: abstention ---

describe('TCAR-016: shouldAbstain', () => {
  it('does not abstain when all thresholds are met', () => {
    const input = makeAbstentionInput({
      analogSupportCount: 10,
      candidateConcentrationGini: 0.3,
      top1AnalogWeight: 0.2,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(false)
    expect(result.reasons).toHaveLength(0)
  })

  it('abstains when analog_support < threshold', () => {
    const input = makeAbstentionInput({
      analogSupportCount: ABSTENTION_THRESHOLDS.minAnalogSupport - 1,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(true)
    expect(result.reasons).toContain('insufficient_analog_support')
  })

  it('abstains when candidate_concentration_gini > threshold', () => {
    const input = makeAbstentionInput({
      candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini + 0.01,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(true)
    expect(result.reasons).toContain('high_candidate_concentration')
  })

  it('abstains when top1_analog_weight > threshold', () => {
    const input = makeAbstentionInput({
      top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight + 0.01,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(true)
    expect(result.reasons).toContain('dominant_single_analog')
  })

  it('reports multiple abstention reasons', () => {
    const input = makeAbstentionInput({
      analogSupportCount: 2,
      candidateConcentrationGini: 0.9,
      top1AnalogWeight: 0.9,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(true)
    expect(result.reasons).toHaveLength(3)
  })

  it('does not abstain at exact boundary values', () => {
    const input = makeAbstentionInput({
      analogSupportCount: ABSTENTION_THRESHOLDS.minAnalogSupport,
      candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini,
      top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight,
    })
    const result = shouldAbstain(input)
    expect(result.abstain).toBe(false)
  })

  it('abstains when inputs are NaN (fail-closed)', () => {
    const result = shouldAbstain({
      analogSupportCount: NaN,
      candidateConcentrationGini: NaN,
      top1AnalogWeight: NaN,
    })
    expect(result.abstain).toBe(true)
    expect(result.reasons).toHaveLength(3)
  })
})

// --- Fix 4: NaN/isFinite guards ---

describe('Fix 4: NaN guard — computeEvidenceQualityScore', () => {
  it('returns 0 when NaN inputs would produce NaN', () => {
    const input = makeEvidenceInput({
      analogSupportCount: NaN,
      candidateConcentrationGini: NaN,
      top1AnalogWeight: NaN,
      analogFuturePathCoverage: NaN,
      mismatchCount: NaN,
    })
    const score = computeEvidenceQualityScore(input)
    expect(score).toBe(0)
    expect(isFinite(score)).toBe(true)
  })

  it('returns 0 when Infinity inputs would produce NaN', () => {
    const input = makeEvidenceInput({
      analogSupportCount: Infinity,
      candidateConcentrationGini: Infinity,
      top1AnalogWeight: Infinity,
      analogFuturePathCoverage: -Infinity,
      mismatchCount: Infinity,
    })
    const score = computeEvidenceQualityScore(input)
    expect(isFinite(score)).toBe(true)
  })
})

describe('Fix 4: NaN guard — computeECE (fail-closed)', () => {
  it('returns ece=1 (worst-case) when bin values produce NaN', () => {
    const bins: CalibrationBin[] = [
      { predictedProb: NaN, actualOutcome: NaN, count: 10 },
    ]
    const result = computeECE(bins)
    expect(result.ece).toBe(1)
    expect(isFinite(result.ece)).toBe(true)
  })
})

describe('E2E: corrupt ECE propagates fail-closed through ship gate', () => {
  it('computeECE NaN → ece=1 → ship gate rejects (global ECE ceiling exceeded)', async () => {
    const { evaluateShipGate } = await import('../../../scripts/tli/research/forecast-ship-gate')
    // Step 1: computeECE with corrupt bins produces ece=1
    const corruptBins: CalibrationBin[] = [
      { predictedProb: NaN, actualOutcome: NaN, count: 10 },
    ]
    const eceResult = computeECE(corruptBins)
    expect(eceResult.ece).toBe(1)

    // Step 2: Feed ece=1 into ship gate → must fail (ceiling = 0.05)
    const verdict = evaluateShipGate({
      prospectiveShadowWeeks: 8,
      totalLiveQueries: 600,
      ibsBaseline: 0.20,
      ibsCandidate: 0.18,
      brierScores: {
        baseline: { 5: 0.30, 10: 0.28, 20: 0.25 },
        candidate: { 5: 0.27, 10: 0.25, 20: 0.22 },
      },
      globalECE: eceResult.ece, // 1.0 from corrupt bins
      sliceSummaries: {
        Growth: { liveQueries: 100, ece: 0.03 },
        Peak: { liveQueries: 100, ece: 0.03 },
      },
      confidenceGating: {
        analogSupport: ABSTENTION_THRESHOLDS.minAnalogSupport,
        candidateConcentrationGini: ABSTENTION_THRESHOLDS.maxCandidateConcentrationGini,
        top1AnalogWeight: ABSTENTION_THRESHOLDS.maxTop1AnalogWeight,
      },
    })

    // Step 3: Ship gate must reject — globalECE 1.0 > ceiling 0.05
    expect(verdict.cutoverRecommended).toBe(false)
    expect(verdict.failedCriteria).toContain('global_ece_too_high')
    expect(verdict.metrics.globalECE).toBe(1)
  })
})
