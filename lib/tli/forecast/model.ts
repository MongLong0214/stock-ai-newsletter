/**
 * TCAR-015: Retrieval-Conditioned Forecast Head
 *
 * Analog-weighted baseline forecaster, event-time/survival head,
 * and post-peak risk head. All functions are PURE (no DB calls).
 * Requires Stage 2 gate artifact to execute.
 */
import { FORECAST_HORIZONS } from './types'
import type { ForecastHorizon } from './types'
import type { Stage } from '../types/db'

// Re-export survival head from dedicated module (backward compatibility)
export { computeSurvivalHead } from './survival'
export type { SurvivalOutput } from './survival'

// --- Types ---

export interface AnalogRecord {
  weight: number
  peakDay: number
  totalDays: number
  finalStage: Stage
  postPeakDrawdown: number | null
}

export interface ForecastOutput {
  probabilities: Record<ForecastHorizon, number>
  expectedPeakDay: number
  confidence: number
}

export interface PostPeakRiskOutput {
  expectedDrawdown: number
  severeDrawdownProb: number
}

interface Stage2Gate {
  stage2Passed: true
}

// --- Constants ---

const SEVERE_DRAWDOWN_THRESHOLD = 0.5

// --- Analog-Weighted Baseline Forecaster ---

export const computeAnalogWeightedForecast = (
  analogs: AnalogRecord[],
  stage2Gate: Stage2Gate | undefined,
): ForecastOutput => {
  if (!stage2Gate) {
    throw new Error('Stage 2 gate artifact required')
  }

  if (analogs.length === 0) {
    return {
      probabilities: { 5: 0, 10: 0, 20: 0 } as Record<ForecastHorizon, number>,
      expectedPeakDay: 0,
      confidence: 0,
    }
  }

  const totalWeight = analogs.reduce((sum, a) => sum + a.weight, 0)
  if (totalWeight === 0) {
    return {
      probabilities: { 5: 0, 10: 0, 20: 0 } as Record<ForecastHorizon, number>,
      expectedPeakDay: 0,
      confidence: 0,
    }
  }

  const probabilities = {} as Record<ForecastHorizon, number>
  for (const h of FORECAST_HORIZONS) {
    let weightedSum = 0
    for (const analog of analogs) {
      const normalizedWeight = analog.weight / totalWeight
      const reached = analog.peakDay <= h ? 1 : 0
      weightedSum += normalizedWeight * reached
    }
    probabilities[h] = weightedSum
  }

  let expectedPeakDay = 0
  for (const analog of analogs) {
    expectedPeakDay += (analog.weight / totalWeight) * analog.peakDay
  }

  const confidence = computeConfidence(analogs, totalWeight)

  return { probabilities, expectedPeakDay, confidence }
}

// --- Post-Peak Risk Head ---

export const computePostPeakRisk = (
  analogs: AnalogRecord[],
): PostPeakRiskOutput => {
  const withDrawdown = analogs.filter((a) => a.postPeakDrawdown !== null)

  if (withDrawdown.length === 0) {
    return { expectedDrawdown: 0, severeDrawdownProb: 0 }
  }

  const totalWeight = withDrawdown.reduce((sum, a) => sum + a.weight, 0)
  if (totalWeight === 0) {
    return { expectedDrawdown: 0, severeDrawdownProb: 0 }
  }

  let expectedDrawdown = 0
  let severeWeight = 0
  for (const analog of withDrawdown) {
    const normalizedWeight = analog.weight / totalWeight
    const drawdown = analog.postPeakDrawdown as number
    expectedDrawdown += normalizedWeight * drawdown
    if (drawdown >= SEVERE_DRAWDOWN_THRESHOLD) {
      severeWeight += normalizedWeight
    }
  }

  return { expectedDrawdown, severeDrawdownProb: severeWeight }
}

// --- Internal helpers ---

const computeConfidence = (analogs: AnalogRecord[], totalWeight: number): number => {
  // Confidence based on:
  // 1. Number of analogs (more = better, caps at 10)
  // 2. Weight entropy (more spread = better)
  const countFactor = Math.min(analogs.length / 10, 1)

  // Normalized entropy: H / log(n), where H = -sum(p * log(p))
  let entropy = 0
  for (const analog of analogs) {
    const p = analog.weight / totalWeight
    if (p > 0) {
      entropy -= p * Math.log(p)
    }
  }
  const maxEntropy = analogs.length > 1 ? Math.log(analogs.length) : 1
  const entropyFactor = maxEntropy > 0 ? entropy / maxEntropy : 0

  // Combine: 60% count, 40% entropy spread
  return 0.6 * countFactor + 0.4 * entropyFactor
}
