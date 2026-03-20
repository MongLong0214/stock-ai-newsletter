/**
 * TCAR-017: Shadow Evaluation Orchestrator
 *
 * Aggregates slice-level live query data and delegates
 * to the ship gate evaluator for a cutover verdict.
 * Pure function — no DB calls.
 */
import { evaluateShipGate, type ShipGateInput, type ShipGateVerdict } from './forecast-ship-gate'
import type { ForecastHorizon } from '@/lib/tli/forecast/types'

// --- Types ---

export interface ShadowEvalInput {
  shadowWeeks: number
  liveQueryRows: { sliceName: string; queryCount: number; ece: number }[]
  ibsBaseline: number
  ibsCandidate: number
  brierBaseline: Record<ForecastHorizon, number>
  brierCandidate: Record<ForecastHorizon, number>
  globalECE: number
  confidenceGating: {
    analogSupport: number
    candidateConcentrationGini: number
    top1AnalogWeight: number
  }
}

export interface ShadowEvalResult {
  shipGateVerdict: ShipGateVerdict
  totalLiveQueries: number
  sliceSummaries: Record<string, { liveQueries: number; ece: number }>
}

// --- Shadow Evaluation ---

export const evaluateForecastShadow = (input: ShadowEvalInput): ShadowEvalResult => {
  const sliceSummaries: Record<string, { liveQueries: number; ece: number }> = {}
  let totalLiveQueries = 0
  for (const row of input.liveQueryRows) {
    // Skip non-finite rows (fail-closed: corrupt data excluded from aggregation)
    if (!isFinite(row.queryCount) || !isFinite(row.ece)) continue

    const existing = sliceSummaries[row.sliceName]
    if (existing) {
      // Accumulate: weighted ECE by query count, sum queries
      const totalQueries = existing.liveQueries + row.queryCount
      existing.ece = totalQueries > 0
        ? (existing.ece * existing.liveQueries + row.ece * row.queryCount) / totalQueries
        : 0
      existing.liveQueries = totalQueries
    } else {
      sliceSummaries[row.sliceName] = { liveQueries: row.queryCount, ece: row.ece }
    }
    totalLiveQueries += row.queryCount
  }

  const shipGateInput: ShipGateInput = {
    prospectiveShadowWeeks: input.shadowWeeks,
    totalLiveQueries,
    ibsBaseline: input.ibsBaseline,
    ibsCandidate: input.ibsCandidate,
    brierScores: {
      baseline: input.brierBaseline,
      candidate: input.brierCandidate,
    },
    globalECE: input.globalECE,
    sliceSummaries,
    confidenceGating: input.confidenceGating,
  }

  return {
    shipGateVerdict: evaluateShipGate(shipGateInput),
    totalLiveQueries,
    sliceSummaries,
  }
}
