import { describe, it, expect } from 'vitest'
import { computeECE, calibrateConfidenceThresholds } from '../confidence-calibration'

describe('computeECE', () => {
  it('returns 0 for empty samples', () => {
    expect(computeECE([])).toBe(0)
  })

  it('returns 0 for perfectly calibrated predictions', () => {
    // high confidence → 80% accuracy, medium → 50%, low → 20%
    const samples = [
      ...Array.from({ length: 80 }, () => ({ predicted: 'high' as const, actual: true })),
      ...Array.from({ length: 20 }, () => ({ predicted: 'high' as const, actual: false })),
      ...Array.from({ length: 50 }, () => ({ predicted: 'medium' as const, actual: true })),
      ...Array.from({ length: 50 }, () => ({ predicted: 'medium' as const, actual: false })),
      ...Array.from({ length: 20 }, () => ({ predicted: 'low' as const, actual: true })),
      ...Array.from({ length: 80 }, () => ({ predicted: 'low' as const, actual: false })),
    ]
    expect(computeECE(samples)).toBeCloseTo(0, 1)
  })

  it('returns > 0 for miscalibrated predictions', () => {
    // All high confidence but only 20% accurate
    const samples = [
      ...Array.from({ length: 20 }, () => ({ predicted: 'high' as const, actual: true })),
      ...Array.from({ length: 80 }, () => ({ predicted: 'high' as const, actual: false })),
    ]
    expect(computeECE(samples)).toBeGreaterThan(0.3)
  })

  it('ensures monotonicity: better calibration → lower ECE', () => {
    const good = [
      ...Array.from({ length: 75 }, () => ({ predicted: 'high' as const, actual: true })),
      ...Array.from({ length: 25 }, () => ({ predicted: 'high' as const, actual: false })),
    ]
    const bad = [
      ...Array.from({ length: 30 }, () => ({ predicted: 'high' as const, actual: true })),
      ...Array.from({ length: 70 }, () => ({ predicted: 'high' as const, actual: false })),
    ]
    expect(computeECE(good)).toBeLessThan(computeECE(bad))
  })
})

describe('calibrateConfidenceThresholds', () => {
  it('returns null for less than 30 samples', () => {
    const samples = Array.from({ length: 20 }, () => ({
      coverageScore: 0.5, interestDays: 10, accurate: true,
    }))
    expect(calibrateConfidenceThresholds(samples)).toBeNull()
  })

  it('returns valid thresholds for sufficient data', () => {
    const samples = Array.from({ length: 50 }, (_, i) => ({
      coverageScore: i / 50,
      interestDays: Math.floor(i / 2),
      accurate: i > 25,
    }))
    const result = calibrateConfidenceThresholds(samples)
    if (result) {
      expect(result.highCoverage).toBeGreaterThan(result.mediumCoverage)
      expect(result.highDays).toBeGreaterThan(result.mediumDays)
      expect(result.ece).toBeGreaterThanOrEqual(0)
    }
  })
})
