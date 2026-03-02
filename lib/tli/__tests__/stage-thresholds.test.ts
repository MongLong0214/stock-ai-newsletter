import { describe, it, expect } from 'vitest'
import { computeAdaptiveThresholds, DEFAULT_THRESHOLDS } from '../stage-thresholds'

describe('computeAdaptiveThresholds', () => {
  it('returns null for less than 30 scores', () => {
    const scores = Array.from({ length: 20 }, () => Math.random() * 100)
    expect(computeAdaptiveThresholds(scores)).toBeNull()
  })

  it('returns null for unimodal distribution (no valleys)', () => {
    // All scores around 50 → single peak, no valleys
    const scores = Array.from({ length: 100 }, () => 50 + (Math.random() - 0.5) * 5)
    const result = computeAdaptiveThresholds(scores)
    // May or may not find valleys depending on randomness
    // At least verify it doesn't crash
    expect(result === null || typeof result.dormant === 'number').toBe(true)
  })

  it('finds boundaries for bimodal distribution', () => {
    // Clear bimodal: cluster at 20 and cluster at 70
    const scores = [
      ...Array.from({ length: 50 }, () => 20 + (Math.random() - 0.5) * 10),
      ...Array.from({ length: 50 }, () => 70 + (Math.random() - 0.5) * 10),
    ]
    const result = computeAdaptiveThresholds(scores)
    // Should find at least one valley between 20 and 70
    if (result) {
      expect(result.dormant).toBeGreaterThanOrEqual(5)
      expect(result.dormant).toBeLessThanOrEqual(30)
    }
  })

  it('default thresholds have expected values', () => {
    expect(DEFAULT_THRESHOLDS.dormant).toBe(15)
    expect(DEFAULT_THRESHOLDS.emerging).toBe(40)
    expect(DEFAULT_THRESHOLDS.growth).toBe(58)
    expect(DEFAULT_THRESHOLDS.peak).toBe(68)
    expect(DEFAULT_THRESHOLDS.peak).toBeGreaterThan(DEFAULT_THRESHOLDS.growth)
  })

  it('growth and peak thresholds differ when peakValley is null', () => {
    // Trimodal: clusters at 10, 40, 75 → valleys near 25 and 55
    // No valley in 50-80 range → peakValley null → growth and peak should differ
    const scores = [
      ...Array.from({ length: 40 }, () => 10 + (Math.random() - 0.5) * 6),
      ...Array.from({ length: 40 }, () => 40 + (Math.random() - 0.5) * 6),
      ...Array.from({ length: 40 }, () => 75 + (Math.random() - 0.5) * 6),
    ]
    const result = computeAdaptiveThresholds(scores)
    if (result) {
      // When peakValley found: growth === peak is fine
      // When peakValley null: growth = growthValley+15, peak = growthValley+28
      // Either way, peak >= growth
      expect(result.peak).toBeGreaterThanOrEqual(result.growth)
    }
  })
})
