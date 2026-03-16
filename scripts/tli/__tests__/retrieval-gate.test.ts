import { describe, it, expect } from 'vitest'
import { GATE_THRESHOLDS } from '../../../lib/tli/forecast/types'
import {
  evaluateRetrievalGate,
  type RetrievalGateInput,
  type RetrievalGateVerdict,
  type SliceResult,
} from '../retrieval-gate'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePassingInput = (overrides: Partial<RetrievalGateInput> = {}): RetrievalGateInput => ({
  futurePathCorrDelta: 0.05,
  peakHitDelta: 0.06,
  peakGapImprovementPct: 10,
  sliceResults: [
    { sliceName: 'Growth', regressionDelta: 0.0 },
    { sliceName: 'Peak', regressionDelta: 0.0 },
  ],
  sliceEvalRows: 400,
  sliceCompletedEpisodes: 60,
  ...overrides,
})

// ---------------------------------------------------------------------------
// TCAR-014: Retrieval Gate
// ---------------------------------------------------------------------------

describe('TCAR-014: evaluateRetrievalGate', () => {
  it('passes when all thresholds are met', () => {
    const result = evaluateRetrievalGate(makePassingInput())

    expect(result.passed).toBe(true)
    expect(result.stageBlocked).toBe(false)
    expect(result.checks.futurePathCorr).toBe(true)
    expect(result.checks.peakHit).toBe(true)
    expect(result.checks.peakGapImprovement).toBe(true)
    expect(result.checks.sliceRegression).toBe(true)
    expect(result.checks.phaseBReadiness).toBe(true)
  })

  it('fails when futurePathCorrDelta is below threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({ futurePathCorrDelta: 0.01 }),
    )

    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
    expect(result.checks.futurePathCorr).toBe(false)
  })

  it('passes when futurePathCorrDelta equals the exact threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        futurePathCorrDelta: GATE_THRESHOLDS.retrieval.futurePathCorrLowerBound,
      }),
    )

    expect(result.checks.futurePathCorr).toBe(true)
  })

  it('fails when peakHitDelta is below threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({ peakHitDelta: 0.02 }),
    )

    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
    expect(result.checks.peakHit).toBe(false)
  })

  it('fails when peakGapImprovementPct is below threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({ peakGapImprovementPct: 4 }),
    )

    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
    expect(result.checks.peakGapImprovement).toBe(false)
  })

  it('fails when any slice regression exceeds the limit', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        sliceResults: [
          { sliceName: 'Growth', regressionDelta: 0.0 },
          { sliceName: 'Peak', regressionDelta: -0.02 },
        ],
      }),
    )

    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
    expect(result.checks.sliceRegression).toBe(false)
  })

  it('passes when slice regression equals the exact limit', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        sliceResults: [
          { sliceName: 'Growth', regressionDelta: GATE_THRESHOLDS.retrieval.sliceRegressionLimit },
        ],
      }),
    )

    expect(result.checks.sliceRegression).toBe(true)
  })

  it('fails when neither phaseBReadiness condition is met', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        sliceEvalRows: 200,
        sliceCompletedEpisodes: 30,
      }),
    )

    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
    expect(result.checks.phaseBReadiness).toBe(false)
  })

  it('passes phaseBReadiness when only sliceEvalRows meets the threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        sliceEvalRows: 300,
        sliceCompletedEpisodes: 10,
      }),
    )

    expect(result.checks.phaseBReadiness).toBe(true)
  })

  it('passes phaseBReadiness when only sliceCompletedEpisodes meets the threshold', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({
        sliceEvalRows: 100,
        sliceCompletedEpisodes: 50,
      }),
    )

    expect(result.checks.phaseBReadiness).toBe(true)
  })

  it('blocks Stage 3 when gate fails', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({ futurePathCorrDelta: 0.0 }),
    )

    expect(result.stageBlocked).toBe(true)
  })

  it('does not block Stage 3 when gate passes', () => {
    const result = evaluateRetrievalGate(makePassingInput())

    expect(result.stageBlocked).toBe(false)
  })

  it('reports all failing checks simultaneously', () => {
    const result = evaluateRetrievalGate({
      futurePathCorrDelta: 0.0,
      peakHitDelta: 0.0,
      peakGapImprovementPct: 0,
      sliceResults: [
        { sliceName: 'Decline', regressionDelta: -0.05 },
      ],
      sliceEvalRows: 10,
      sliceCompletedEpisodes: 5,
    })

    expect(result.passed).toBe(false)
    expect(result.checks.futurePathCorr).toBe(false)
    expect(result.checks.peakHit).toBe(false)
    expect(result.checks.peakGapImprovement).toBe(false)
    expect(result.checks.sliceRegression).toBe(false)
    expect(result.checks.phaseBReadiness).toBe(false)
  })

  it('uses GATE_THRESHOLDS from forecast types (not hardcoded)', () => {
    // Verify the function references the canonical thresholds
    // by checking boundary behavior at the exact threshold values
    const exactThreshold = evaluateRetrievalGate(makePassingInput({
      futurePathCorrDelta: GATE_THRESHOLDS.retrieval.futurePathCorrLowerBound,
      peakHitDelta: GATE_THRESHOLDS.retrieval.peakHitLowerBound,
      peakGapImprovementPct: GATE_THRESHOLDS.retrieval.peakGapImprovementPct,
      sliceResults: [
        { sliceName: 'Growth', regressionDelta: GATE_THRESHOLDS.retrieval.sliceRegressionLimit },
      ],
      sliceEvalRows: GATE_THRESHOLDS.phaseBReadiness.minSliceEvalRows,
      sliceCompletedEpisodes: 0,
    }))

    expect(exactThreshold.passed).toBe(true)
  })

  it('fails when sliceResults is empty (fail-closed: no evidence = fail)', () => {
    const result = evaluateRetrievalGate(
      makePassingInput({ sliceResults: [] }),
    )

    // Fail-closed: empty sliceResults = no regression evidence = fail
    expect(result.checks.sliceRegression).toBe(false)
    expect(result.passed).toBe(false)
    expect(result.stageBlocked).toBe(true)
  })
})
