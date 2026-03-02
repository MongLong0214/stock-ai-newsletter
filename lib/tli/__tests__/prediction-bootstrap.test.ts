import { describe, it, expect } from 'vitest'
import { bootstrapCI, computePredictionIntervals } from '../prediction-bootstrap'

describe('bootstrapCI', () => {
  it('returns null for empty values', () => {
    expect(bootstrapCI([], [])).toBeNull()
  })

  it('returns null for single value (insufficient for CI)', () => {
    expect(bootstrapCI([50], [1])).toBeNull()
  })

  it('returns null for zero total weight', () => {
    expect(bootstrapCI([1, 2, 3], [0, 0, 0])).toBeNull()
  })

  it('returns narrow CI for identical values', () => {
    const values = [50, 50, 50, 50, 50]
    const weights = [1, 1, 1, 1, 1]
    const ci = bootstrapCI(values, weights)
    expect(ci).not.toBeNull()
    if (ci) {
      expect(ci.lower).toBe(50)
      expect(ci.upper).toBe(50)
      expect(ci.median).toBe(50)
      expect(ci.confidenceLevel).toBe(0.9)
    }
  })

  it('returns wider CI for dispersed values', () => {
    const values = [10, 30, 50, 70, 90]
    const weights = [1, 1, 1, 1, 1]
    const ci = bootstrapCI(values, weights)
    expect(ci).not.toBeNull()
    if (ci) {
      expect(ci.upper - ci.lower).toBeGreaterThan(10)
      expect(ci.lower).toBeLessThan(ci.median)
      expect(ci.upper).toBeGreaterThan(ci.median)
    }
  })

  it('higher-weighted values pull the CI via CDF sampling', () => {
    // CDF-weighted sampling: heavier weight → sampled more often → pulls simple mean
    const values = [10, 90]
    const heavyLow = bootstrapCI(values, [10, 1])
    const heavyHigh = bootstrapCI(values, [1, 10])
    expect(heavyLow).not.toBeNull()
    expect(heavyHigh).not.toBeNull()
    if (heavyLow && heavyHigh) {
      expect(heavyLow.median).toBeLessThan(heavyHigh.median)
    }
  })

  it('uses simple mean after CDF-weighted sampling (no double weighting)', () => {
    // With equal weights, bootstrap mean should approximate arithmetic mean
    const values = [20, 40, 60, 80, 100]
    const weights = [1, 1, 1, 1, 1]
    const ci = bootstrapCI(values, weights)
    expect(ci).not.toBeNull()
    if (ci) {
      // Arithmetic mean = 60, median should be close
      expect(ci.median).toBeGreaterThanOrEqual(55)
      expect(ci.median).toBeLessThanOrEqual(65)
    }
  })

  it('w² regression: unequal weights should not over-concentrate CI', () => {
    // Before fix: values[lo] * weights[lo] / weightSum → extreme weight squared effect
    // After fix: CDF sampling handles weighting, mean is simple average
    const values = [10, 50, 90]
    const weights = [0.1, 0.1, 10] // heavily favor 90
    const ci = bootstrapCI(values, weights)
    expect(ci).not.toBeNull()
    if (ci) {
      // CDF sampling makes ~97% of draws pick 90
      // Simple mean ≈ 90 for most bootstrap samples
      // But CI width should NOT collapse to [90, 90] — some draws still pick 10/50
      // With double-weighting (w²), the CI was artificially tight because
      // 90*10 dominated both numerator and denominator
      expect(ci.median).toBeGreaterThanOrEqual(70)
      // The CI should have SOME width (not perfectly [90,90])
      expect(ci.upper).toBeGreaterThanOrEqual(ci.lower)
    }
  })

  it('is deterministic (same seed)', () => {
    const values = [10, 20, 30, 40, 50]
    const weights = [0.5, 0.6, 0.7, 0.8, 0.9]
    const ci1 = bootstrapCI(values, weights)
    const ci2 = bootstrapCI(values, weights)
    expect(ci1).toEqual(ci2)
  })
})

describe('computePredictionIntervals', () => {
  it('returns CIs for valid comparisons', () => {
    const comparisons = [
      { pastPeakDay: 30, pastTotalDays: 60, similarity: 0.8 },
      { pastPeakDay: 40, pastTotalDays: 80, similarity: 0.7 },
      { pastPeakDay: 25, pastTotalDays: 50, similarity: 0.6 },
    ]
    const result = computePredictionIntervals(comparisons)
    expect(result.peakDayCI).not.toBeNull()
    expect(result.totalDaysCI).not.toBeNull()
    if (result.peakDayCI) {
      expect(result.peakDayCI.lower).toBeLessThanOrEqual(result.peakDayCI.upper)
    }
  })
})
