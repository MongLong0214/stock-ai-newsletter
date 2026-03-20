/**
 * TCAR-017: Shadow Evaluation Orchestrator
 *
 * Tests for evaluateForecastShadow — aggregates slice data
 * and delegates to evaluateShipGate.
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateForecastShadow,
  type ShadowEvalInput,
} from '../research/evaluate-forecast-shadow'

const makeInput = (overrides: Partial<ShadowEvalInput> = {}): ShadowEvalInput => ({
  shadowWeeks: 8,
  liveQueryRows: [
    { sliceName: 'early', queryCount: 200, ece: 0.03 },
    { sliceName: 'growth', queryCount: 250, ece: 0.04 },
  ],
  ibsBaseline: 0.5,
  ibsCandidate: 0.4,
  brierBaseline: { 5: 0.3, 10: 0.25, 20: 0.2 },
  brierCandidate: { 5: 0.25, 10: 0.2, 20: 0.15 },
  globalECE: 0.03,
  confidenceGating: {
    analogSupport: 10,
    candidateConcentrationGini: 0.3,
    top1AnalogWeight: 0.2,
  },
  ...overrides,
})

describe('TCAR-017: evaluateForecastShadow', () => {
  it('aggregates totalLiveQueries from slice rows', () => {
    const result = evaluateForecastShadow(makeInput())
    expect(result.totalLiveQueries).toBe(450)
  })

  it('builds sliceSummaries from liveQueryRows', () => {
    const result = evaluateForecastShadow(makeInput())
    expect(result.sliceSummaries).toEqual({
      early: { liveQueries: 200, ece: 0.03 },
      growth: { liveQueries: 250, ece: 0.04 },
    })
  })

  it('delegates to ship gate and returns verdict', () => {
    const result = evaluateForecastShadow(makeInput())
    expect(result.shipGateVerdict).toBeDefined()
    expect(typeof result.shipGateVerdict.cutoverRecommended).toBe('boolean')
    expect(Array.isArray(result.shipGateVerdict.failedCriteria)).toBe(true)
    expect(result.shipGateVerdict.metrics).toBeDefined()
  })

  it('passes confidence gating to ship gate when provided', () => {
    const result = evaluateForecastShadow(makeInput({
      confidenceGating: {
        analogSupport: 10,
        candidateConcentrationGini: 0.3,
        top1AnalogWeight: 0.2,
      },
    }))
    expect(result.shipGateVerdict.metrics.confidenceGatingPassed).toBe(true)
  })

  it('fails confidence gating when thresholds not met', () => {
    const result = evaluateForecastShadow(makeInput({
      confidenceGating: {
        analogSupport: 0,
        candidateConcentrationGini: 1.0,
        top1AnalogWeight: 1.0,
      },
    }))
    expect(result.shipGateVerdict.metrics.confidenceGatingPassed).toBe(false)
    expect(result.shipGateVerdict.failedCriteria).toContain('confidence_gating_not_met')
  })

  it('accumulates duplicate sliceName rows instead of overwriting', () => {
    const result = evaluateForecastShadow(makeInput({
      liveQueryRows: [
        { sliceName: 'growth', queryCount: 100, ece: 0.02 },
        { sliceName: 'growth', queryCount: 200, ece: 0.05 },
      ],
    }))
    expect(result.totalLiveQueries).toBe(300)
    expect(result.sliceSummaries.growth.liveQueries).toBe(300)
    // Weighted ECE: (0.02*100 + 0.05*200) / 300 = 12/300 = 0.04
    expect(result.sliceSummaries.growth.ece).toBeCloseTo(0.04, 5)
  })

  it('skips NaN/non-finite rows in accumulation (fail-closed)', () => {
    const result = evaluateForecastShadow(makeInput({
      liveQueryRows: [
        { sliceName: 'growth', queryCount: 200, ece: 0.03 },
        { sliceName: 'growth', queryCount: NaN, ece: 0.05 },
        { sliceName: 'growth', queryCount: 100, ece: NaN },
        { sliceName: 'poison', queryCount: Infinity, ece: 0.01 },
        { sliceName: 'clean', queryCount: 50, ece: 0.02 },
      ],
    }))
    // NaN/Infinity rows skipped — only 'growth' (200, 0.03) and 'clean' (50, 0.02) survive
    expect(result.totalLiveQueries).toBe(250)
    expect(result.sliceSummaries.growth).toEqual({ liveQueries: 200, ece: 0.03 })
    expect(result.sliceSummaries.clean).toEqual({ liveQueries: 50, ece: 0.02 })
    expect(result.sliceSummaries.poison).toBeUndefined()
  })

  it('handles empty liveQueryRows with no_slice_coverage failure', () => {
    const result = evaluateForecastShadow(makeInput({
      liveQueryRows: [],
    }))
    expect(result.totalLiveQueries).toBe(0)
    expect(result.sliceSummaries).toEqual({})
    expect(result.shipGateVerdict.failedCriteria).toContain('no_slice_coverage')
  })

  it('ship gate reports insufficient queries for low totals', () => {
    const result = evaluateForecastShadow(makeInput({
      liveQueryRows: [
        { sliceName: 'tiny', queryCount: 10, ece: 0.01 },
      ],
    }))
    expect(result.shipGateVerdict.failedCriteria).toContain('insufficient_live_queries')
  })
})
