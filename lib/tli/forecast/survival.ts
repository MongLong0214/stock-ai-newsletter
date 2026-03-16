/**
 * TCAR-015: Event-Time / Survival Head
 *
 * Extracted from model.ts for standalone use.
 * Computes survival probabilities and median time-to-peak.
 */
import { FORECAST_HORIZONS } from './types'
import type { ForecastHorizon } from './types'

// --- Types ---

interface SurvivalAnalogInput {
  weight: number
  peakDay: number
}

export interface SurvivalOutput {
  survivalProbabilities: Record<ForecastHorizon, number>
  medianTimeToPeak: number
}

// --- Event-Time / Survival Head ---

export const computeSurvivalHead = (
  analogs: SurvivalAnalogInput[],
): SurvivalOutput => {
  if (analogs.length === 0) {
    return {
      survivalProbabilities: { 5: 0, 10: 0, 20: 0 } as Record<ForecastHorizon, number>,
      medianTimeToPeak: 0,
    }
  }

  const totalWeight = analogs.reduce((sum, a) => sum + a.weight, 0)
  if (totalWeight === 0) {
    return {
      survivalProbabilities: { 5: 0, 10: 0, 20: 0 } as Record<ForecastHorizon, number>,
      medianTimeToPeak: 0,
    }
  }

  // Survival = P(peakDay > horizon) = 1 - CDF(horizon)
  const survivalProbabilities = {} as Record<ForecastHorizon, number>
  for (const h of FORECAST_HORIZONS) {
    let weightedCDF = 0
    for (const analog of analogs) {
      const normalizedWeight = analog.weight / totalWeight
      const reachedPeak = analog.peakDay <= h ? 1 : 0
      weightedCDF += normalizedWeight * reachedPeak
    }
    survivalProbabilities[h] = 1 - weightedCDF
  }

  // Weighted median: sort by peakDay, find point where cumulative weight >= 0.5
  const sorted = [...analogs].sort((a, b) => a.peakDay - b.peakDay)
  let cumulativeWeight = 0
  // Fallback: last element (unreachable when totalWeight > 0, but makes invariant explicit)
  let medianTimeToPeak = sorted[sorted.length - 1].peakDay
  for (const analog of sorted) {
    cumulativeWeight += analog.weight / totalWeight
    if (cumulativeWeight >= 0.5) {
      medianTimeToPeak = analog.peakDay
      break
    }
  }

  return { survivalProbabilities, medianTimeToPeak }
}
