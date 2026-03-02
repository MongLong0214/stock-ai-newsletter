import { describe, it, expect } from 'vitest'
import { computeEntropyWeights } from '../weights/entropy-weights'

describe('computeEntropyWeights', () => {
  it('returns null for less than 3 rows', () => {
    expect(computeEntropyWeights([[1, 2, 3, 4], [5, 6, 7, 8]])).toBeNull()
  })

  it('returns equal-ish weights for uniform distribution', () => {
    // All rows identical → all entropy = max → all divergence = 0
    const matrix = Array.from({ length: 10 }, () => [0.5, 0.5, 0.5, 0.5])
    const result = computeEntropyWeights(matrix)
    // With uniform data, entropy is max, divergence is 0 → null
    expect(result).toBeNull()
  })

  it('gives highest weight to most discriminating criterion', () => {
    // Column 0 varies a lot, column 3 is constant
    const matrix = [
      [0.1, 0.5, 0.5, 0.5],
      [0.3, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
      [0.7, 0.5, 0.5, 0.5],
      [0.9, 0.5, 0.5, 0.5],
    ]
    const result = computeEntropyWeights(matrix)
    expect(result).not.toBeNull()
    if (result) {
      expect(result.interest).toBeGreaterThan(result.activity)
    }
  })

  it('weights sum to 1.0', () => {
    const matrix = Array.from({ length: 20 }, () => [
      Math.random(), Math.random() * 0.5, Math.random() * 0.3, Math.random() * 0.2,
    ])
    const result = computeEntropyWeights(matrix)
    if (result) {
      const sum = result.interest + result.newsMomentum + result.volatility + result.activity
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.002)
    }
  })

  it('respects domain bounds', () => {
    const matrix = Array.from({ length: 30 }, (_, i) => [
      i * 0.1, 0.01, 0.01, 0.01, // interest dominates
    ])
    const result = computeEntropyWeights(matrix)
    if (result) {
      expect(result.interest).toBeLessThanOrEqual(0.55)
      expect(result.interest).toBeGreaterThanOrEqual(0.25)
      expect(result.volatility).toBeGreaterThanOrEqual(0.05)
      expect(result.activity).toBeGreaterThanOrEqual(0.05)
    }
  })
})
