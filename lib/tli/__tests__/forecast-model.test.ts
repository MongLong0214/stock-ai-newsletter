/**
 * TCAR-015: Retrieval-Conditioned Forecast Head
 *
 * Tests for analog-weighted baseline forecaster, event-time/survival head,
 * and post-peak risk head.
 */
import { describe, it, expect } from 'vitest'
import {
  computeAnalogWeightedForecast,
  computeSurvivalHead,
  computePostPeakRisk,
  type AnalogRecord,
} from '../forecast/model'
import { FORECAST_HORIZONS } from '../forecast/types'

// --- helpers ---

const makeAnalog = (overrides: Partial<AnalogRecord> = {}): AnalogRecord => ({
  weight: 0.2,
  peakDay: 15,
  totalDays: 30,
  finalStage: 'Peak',
  postPeakDrawdown: 0.3,
  ...overrides,
})

const makeStage2Gate = (): { stage2Passed: true } => ({ stage2Passed: true })

// --- TCAR-015: analog-weighted baseline forecaster ---

describe('TCAR-015: computeAnalogWeightedForecast', () => {
  it('throws without Stage 2 gate artifact', () => {
    const analogs = [makeAnalog()]
    expect(() =>
      computeAnalogWeightedForecast(analogs, undefined),
    ).toThrow('Stage 2 gate artifact required')
  })

  it('returns zeroed forecast for empty analogs', () => {
    const result = computeAnalogWeightedForecast([], makeStage2Gate())
    expect(result.probabilities).toEqual({ 5: 0, 10: 0, 20: 0 })
    expect(result.expectedPeakDay).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it('computes weighted probabilities for single analog', () => {
    const analogs = [makeAnalog({ weight: 1.0, peakDay: 8 })]
    const result = computeAnalogWeightedForecast(analogs, makeStage2Gate())
    // peakDay=8: peak<=5 → 0, peak<=10 → 1, peak<=20 → 1
    expect(result.probabilities[5]).toBe(0)
    expect(result.probabilities[10]).toBe(1)
    expect(result.probabilities[20]).toBe(1)
    expect(result.expectedPeakDay).toBe(8)
  })

  it('computes weighted average across multiple analogs', () => {
    const analogs = [
      makeAnalog({ weight: 0.6, peakDay: 3 }),  // peak<=5→1, peak<=10→1, peak<=20→1
      makeAnalog({ weight: 0.4, peakDay: 12 }), // peak<=5→0, peak<=10→0, peak<=20→1
    ]
    const result = computeAnalogWeightedForecast(analogs, makeStage2Gate())
    expect(result.probabilities[5]).toBeCloseTo(0.6, 5)
    expect(result.probabilities[10]).toBeCloseTo(0.6, 5)
    expect(result.probabilities[20]).toBeCloseTo(1.0, 5)
    expect(result.expectedPeakDay).toBeCloseTo(0.6 * 3 + 0.4 * 12, 5)
  })

  it('normalizes weights when they do not sum to 1', () => {
    const analogs = [
      makeAnalog({ weight: 0.3, peakDay: 4 }),
      makeAnalog({ weight: 0.3, peakDay: 8 }),
    ]
    const result = computeAnalogWeightedForecast(analogs, makeStage2Gate())
    // Normalized: 0.5 each. peakDay=4: <=5→1,<=10→1,<=20→1. peakDay=8: <=5→0,<=10→1,<=20→1
    expect(result.probabilities[5]).toBeCloseTo(0.5, 5)
    expect(result.probabilities[10]).toBeCloseTo(1.0, 5)
    expect(result.probabilities[20]).toBeCloseTo(1.0, 5)
    expect(result.expectedPeakDay).toBeCloseTo(6, 5) // 0.5*4 + 0.5*8
  })

  it('output contains all FORECAST_HORIZONS keys', () => {
    const result = computeAnalogWeightedForecast(
      [makeAnalog()],
      makeStage2Gate(),
    )
    for (const h of FORECAST_HORIZONS) {
      expect(result.probabilities).toHaveProperty(String(h))
    }
  })

  it('probabilities are monotonically non-decreasing', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, peakDay: 7 }),
      makeAnalog({ weight: 0.5, peakDay: 15 }),
    ]
    const result = computeAnalogWeightedForecast(analogs, makeStage2Gate())
    expect(result.probabilities[5]).toBeLessThanOrEqual(result.probabilities[10])
    expect(result.probabilities[10]).toBeLessThanOrEqual(result.probabilities[20])
  })

  it('confidence reflects analog count and weight spread', () => {
    const single = computeAnalogWeightedForecast(
      [makeAnalog({ weight: 1.0 })],
      makeStage2Gate(),
    )
    const many = computeAnalogWeightedForecast(
      Array.from({ length: 10 }, (_, i) => makeAnalog({ weight: 0.1, peakDay: 5 + i })),
      makeStage2Gate(),
    )
    expect(many.confidence).toBeGreaterThan(single.confidence)
  })
})

// --- TCAR-015: survival head ---

describe('TCAR-015: computeSurvivalHead', () => {
  it('returns survival probabilities for each horizon', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, peakDay: 3 }),
      makeAnalog({ weight: 0.5, peakDay: 25 }),
    ]
    const result = computeSurvivalHead(analogs)
    for (const h of FORECAST_HORIZONS) {
      expect(result.survivalProbabilities[h]).toBeGreaterThanOrEqual(0)
      expect(result.survivalProbabilities[h]).toBeLessThanOrEqual(1)
    }
  })

  it('survival probabilities are monotonically non-increasing', () => {
    const analogs = [
      makeAnalog({ weight: 0.4, peakDay: 7 }),
      makeAnalog({ weight: 0.3, peakDay: 12 }),
      makeAnalog({ weight: 0.3, peakDay: 18 }),
    ]
    const result = computeSurvivalHead(analogs)
    expect(result.survivalProbabilities[5]).toBeGreaterThanOrEqual(result.survivalProbabilities[10])
    expect(result.survivalProbabilities[10]).toBeGreaterThanOrEqual(result.survivalProbabilities[20])
  })

  it('medianTimeToPeak is weighted median', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, peakDay: 10 }),
      makeAnalog({ weight: 0.5, peakDay: 20 }),
    ]
    const result = computeSurvivalHead(analogs)
    expect(result.medianTimeToPeak).toBeGreaterThanOrEqual(10)
    expect(result.medianTimeToPeak).toBeLessThanOrEqual(20)
  })

  it('returns zero for empty analogs', () => {
    const result = computeSurvivalHead([])
    expect(result.medianTimeToPeak).toBe(0)
    for (const h of FORECAST_HORIZONS) {
      expect(result.survivalProbabilities[h]).toBe(0)
    }
  })
})

// --- TCAR-015: post-peak risk head ---

describe('TCAR-015: computePostPeakRisk', () => {
  it('computes drawdown risk from analogs with post-peak data', () => {
    const analogs = [
      makeAnalog({ weight: 0.6, postPeakDrawdown: 0.4 }),
      makeAnalog({ weight: 0.4, postPeakDrawdown: 0.2 }),
    ]
    const result = computePostPeakRisk(analogs)
    expect(result.expectedDrawdown).toBeCloseTo(0.6 * 0.4 + 0.4 * 0.2, 5)
    expect(result.severeDrawdownProb).toBeGreaterThanOrEqual(0)
    expect(result.severeDrawdownProb).toBeLessThanOrEqual(1)
  })

  it('ignores analogs with null postPeakDrawdown', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, postPeakDrawdown: 0.3 }),
      makeAnalog({ weight: 0.5, postPeakDrawdown: null }),
    ]
    const result = computePostPeakRisk(analogs)
    // Only the first analog contributes, re-normalized to weight 1.0
    expect(result.expectedDrawdown).toBeCloseTo(0.3, 5)
  })

  it('returns zero risk for empty analogs', () => {
    const result = computePostPeakRisk([])
    expect(result.expectedDrawdown).toBe(0)
    expect(result.severeDrawdownProb).toBe(0)
  })

  it('severeDrawdownProb is 1 when all analogs have high drawdown', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, postPeakDrawdown: 0.6 }),
      makeAnalog({ weight: 0.5, postPeakDrawdown: 0.7 }),
    ]
    const result = computePostPeakRisk(analogs)
    // threshold for severe = 0.5
    expect(result.severeDrawdownProb).toBe(1)
  })

  it('severeDrawdownProb is 0 when all drawdowns are mild', () => {
    const analogs = [
      makeAnalog({ weight: 0.5, postPeakDrawdown: 0.1 }),
      makeAnalog({ weight: 0.5, postPeakDrawdown: 0.2 }),
    ]
    const result = computePostPeakRisk(analogs)
    expect(result.severeDrawdownProb).toBe(0)
  })
})
