/**
 * TCAR-015: Event-Time / Survival Head
 *
 * Tests for computeSurvivalHead — survival probabilities and median time-to-peak.
 */
import { describe, it, expect } from 'vitest'
import { computeSurvivalHead, type SurvivalOutput } from '../forecast/survival'

describe('TCAR-015: computeSurvivalHead', () => {
  it('returns zero probabilities and zero median for empty analogs', () => {
    const result = computeSurvivalHead([])
    expect(result.survivalProbabilities[5]).toBe(0)
    expect(result.survivalProbabilities[10]).toBe(0)
    expect(result.survivalProbabilities[20]).toBe(0)
    expect(result.medianTimeToPeak).toBe(0)
  })

  it('returns zero probabilities when total weight is 0', () => {
    const result = computeSurvivalHead([
      { weight: 0, peakDay: 7 },
      { weight: 0, peakDay: 15 },
    ])
    expect(result.survivalProbabilities[5]).toBe(0)
    expect(result.medianTimeToPeak).toBe(0)
  })

  it('computes survival = 1 - CDF for single analog', () => {
    // peakDay=7: reached by horizon 5? No. By 10? Yes. By 20? Yes.
    const result = computeSurvivalHead([{ weight: 1, peakDay: 7 }])
    expect(result.survivalProbabilities[5]).toBe(1)  // P(peak > 5) = 1
    expect(result.survivalProbabilities[10]).toBe(0) // P(peak > 10) = 0
    expect(result.survivalProbabilities[20]).toBe(0) // P(peak > 20) = 0
  })

  it('computes weighted survival for multiple analogs', () => {
    // analog1: weight=1, peakDay=3 (reached by all horizons)
    // analog2: weight=1, peakDay=12 (reached by 20 only)
    const result = computeSurvivalHead([
      { weight: 1, peakDay: 3 },
      { weight: 1, peakDay: 12 },
    ])
    // horizon 5: analog1 peaked (CDF=0.5), analog2 not → survival = 1 - 0.5 = 0.5
    expect(result.survivalProbabilities[5]).toBe(0.5)
    // horizon 10: analog1 peaked (0.5), analog2 not → survival = 0.5
    expect(result.survivalProbabilities[10]).toBe(0.5)
    // horizon 20: both peaked → survival = 0
    expect(result.survivalProbabilities[20]).toBe(0)
  })

  it('respects weight differences', () => {
    // analog1: weight=3, peakDay=3 (peaked early)
    // analog2: weight=1, peakDay=15 (peaked late)
    const result = computeSurvivalHead([
      { weight: 3, peakDay: 3 },
      { weight: 1, peakDay: 15 },
    ])
    // horizon 5: analog1 peaked (3/4 CDF), analog2 not → survival = 1 - 0.75 = 0.25
    expect(result.survivalProbabilities[5]).toBe(0.25)
    // horizon 10: same (only analog1 peaked by 10) → survival = 0.25
    expect(result.survivalProbabilities[10]).toBe(0.25)
    // horizon 20: both peaked → survival = 0
    expect(result.survivalProbabilities[20]).toBe(0)
  })

  it('computes weighted median time-to-peak', () => {
    // Equal weight analogs: peaks at 3, 8, 25
    // sorted: 3 (cum=0.33), 8 (cum=0.67 >= 0.5) → median = 8
    const result = computeSurvivalHead([
      { weight: 1, peakDay: 3 },
      { weight: 1, peakDay: 8 },
      { weight: 1, peakDay: 25 },
    ])
    expect(result.medianTimeToPeak).toBe(8)
  })

  it('median with unequal weights', () => {
    // analog1: weight=1, peak=5 (cum=0.25)
    // analog2: weight=3, peak=12 (cum=1.0 >= 0.5) → median = 12
    const result = computeSurvivalHead([
      { weight: 1, peakDay: 5 },
      { weight: 3, peakDay: 12 },
    ])
    expect(result.medianTimeToPeak).toBe(12)
  })

  it('survival probabilities are between 0 and 1', () => {
    const result = computeSurvivalHead([
      { weight: 2, peakDay: 4 },
      { weight: 1, peakDay: 8 },
      { weight: 1, peakDay: 18 },
    ])
    for (const h of [5, 10, 20] as const) {
      expect(result.survivalProbabilities[h]).toBeGreaterThanOrEqual(0)
      expect(result.survivalProbabilities[h]).toBeLessThanOrEqual(1)
    }
  })

  it('all analogs peak after longest horizon → all survival = 1', () => {
    const result = computeSurvivalHead([
      { weight: 1, peakDay: 25 },
      { weight: 1, peakDay: 30 },
    ])
    expect(result.survivalProbabilities[5]).toBe(1)
    expect(result.survivalProbabilities[10]).toBe(1)
    expect(result.survivalProbabilities[20]).toBe(1)
  })

  it('all analogs peak before shortest horizon → all survival = 0', () => {
    const result = computeSurvivalHead([
      { weight: 1, peakDay: 1 },
      { weight: 1, peakDay: 3 },
    ])
    expect(result.survivalProbabilities[5]).toBe(0)
    expect(result.survivalProbabilities[10]).toBe(0)
    expect(result.survivalProbabilities[20]).toBe(0)
  })

  it('produces deterministic output', () => {
    const analogs = [
      { weight: 2, peakDay: 6 },
      { weight: 1, peakDay: 11 },
      { weight: 3, peakDay: 22 },
    ]
    const r1 = computeSurvivalHead(analogs)
    const r2 = computeSurvivalHead(analogs)
    expect(r1).toEqual(r2)
  })

  it('result satisfies SurvivalOutput interface', () => {
    const result: SurvivalOutput = computeSurvivalHead([{ weight: 1, peakDay: 10 }])
    expect(result).toHaveProperty('survivalProbabilities')
    expect(result).toHaveProperty('medianTimeToPeak')
    expect(typeof result.medianTimeToPeak).toBe('number')
  })
})
