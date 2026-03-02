import { describe, it, expect } from 'vitest'
import { dtwDistance, dtwSimilarity } from '../comparison/dtw'

describe('dtwDistance', () => {
  it('returns 0 for identical sequences', () => {
    const a = [1, 2, 3, 4, 5]
    expect(dtwDistance(a, a)).toBeCloseTo(0, 5)
  })

  it('returns Infinity for empty sequences', () => {
    expect(dtwDistance([], [1, 2, 3])).toBe(Infinity)
    expect(dtwDistance([1, 2], [])).toBe(Infinity)
  })

  it('handles phase-shifted signals', () => {
    const a = [0, 0, 1, 2, 3, 2, 1, 0, 0]
    const b = [0, 0, 0, 1, 2, 3, 2, 1, 0]
    const dist = dtwDistance(a, b)
    expect(dist).toBeLessThan(1) // should be small for phase shift
  })

  it('returns large distance for dissimilar signals', () => {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const b = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    const dist = dtwDistance(a, b)
    expect(dist).toBeGreaterThan(1)
  })
})

describe('dtwSimilarity', () => {
  it('returns 1 for identical sequences', () => {
    const a = [1, 2, 3, 4, 5]
    expect(dtwSimilarity(a, a)).toBeCloseTo(1, 2)
  })

  it('returns 0 for empty sequences', () => {
    expect(dtwSimilarity([], [1, 2])).toBe(0)
  })

  it('phase-shifted signals have high similarity (> 0.7)', () => {
    const a = [0, 0, 1, 2, 3, 2, 1, 0, 0]
    const b = [0, 0, 0, 1, 2, 3, 2, 1, 0]
    expect(dtwSimilarity(a, b)).toBeGreaterThan(0.7)
  })

  it('dissimilar signals have low similarity', () => {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const b = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
    expect(dtwSimilarity(a, b)).toBeLessThan(0.5)
  })

  it('returns value in [0, 1] range', () => {
    const a = [1, 3, 5, 7, 9]
    const b = [2, 4, 6, 8, 10]
    const sim = dtwSimilarity(a, b)
    expect(sim).toBeGreaterThanOrEqual(0)
    expect(sim).toBeLessThanOrEqual(1)
  })
})
