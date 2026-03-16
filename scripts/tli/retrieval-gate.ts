import { GATE_THRESHOLDS } from '../../lib/tli/forecast/types'

// ---------------------------------------------------------------------------
// TCAR-014: Retrieval Gate and Slice Audit Pack
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SliceResult {
  sliceName: string
  /** Delta metric for this slice; negative means regression */
  regressionDelta: number
}

export interface RetrievalGateInput {
  /** Delta FuturePathCorr@5 from baseline to reranker */
  futurePathCorrDelta: number
  /** Delta PeakHit@5 from baseline to reranker */
  peakHitDelta: number
  /** PeakGap@5 median improvement percentage */
  peakGapImprovementPct: number
  /** Per-priority-slice regression results */
  sliceResults: SliceResult[]
  /** Number of eval rows in the smallest priority slice */
  sliceEvalRows: number
  /** Number of completed episodes in the smallest priority slice */
  sliceCompletedEpisodes: number
}

export interface RetrievalGateChecks {
  futurePathCorr: boolean
  peakHit: boolean
  peakGapImprovement: boolean
  sliceRegression: boolean
  phaseBReadiness: boolean
}

export interface RetrievalGateVerdict {
  passed: boolean
  checks: RetrievalGateChecks
  /** Stage 2 gate fail blocks Stage 3 learning */
  stageBlocked: boolean
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Evaluates the retrieval gate for Stage 2 -> Stage 3 progression.
 *
 * Checks (from GATE_THRESHOLDS in forecast/types.ts):
 * - retrieval.futurePathCorrLowerBound >= 0.02
 * - retrieval.peakHitLowerBound >= 0.03
 * - retrieval.peakGapImprovementPct >= 5
 * - retrieval.sliceRegressionLimit >= -0.01  (no slice worse than this)
 * - phaseBReadiness: minSliceEvalRows >= 300 OR minSliceCompletedEpisodes >= 50
 *
 * If any check fails, Stage 3 learning is blocked.
 */
export const evaluateRetrievalGate = (
  input: RetrievalGateInput,
): RetrievalGateVerdict => {
  const { retrieval, phaseBReadiness } = GATE_THRESHOLDS

  const futurePathCorr =
    input.futurePathCorrDelta >= retrieval.futurePathCorrLowerBound

  const peakHit =
    input.peakHitDelta >= retrieval.peakHitLowerBound

  const peakGapImprovement =
    input.peakGapImprovementPct >= retrieval.peakGapImprovementPct

  // Fail-closed: empty sliceResults = no evidence = fail (not vacuous true)
  const sliceRegression =
    input.sliceResults.length > 0 &&
    input.sliceResults.every(
      (s) => s.regressionDelta >= retrieval.sliceRegressionLimit,
    )

  const phaseBReady =
    input.sliceEvalRows >= phaseBReadiness.minSliceEvalRows ||
    input.sliceCompletedEpisodes >= phaseBReadiness.minSliceCompletedEpisodes

  const checks: RetrievalGateChecks = {
    futurePathCorr,
    peakHit,
    peakGapImprovement,
    sliceRegression,
    phaseBReadiness: phaseBReady,
  }

  const passed =
    futurePathCorr && peakHit && peakGapImprovement && sliceRegression && phaseBReady

  return {
    passed,
    checks,
    stageBlocked: !passed,
  }
}
