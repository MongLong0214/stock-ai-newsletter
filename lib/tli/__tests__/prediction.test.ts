import { describe, it, expect } from 'vitest'
import { calculatePrediction } from '@/lib/tli/prediction'
import type { ComparisonInput } from '@/lib/tli/prediction'

function makeComparison(overrides: Partial<ComparisonInput> = {}): ComparisonInput {
  return {
    pastTheme: 'Test Theme',
    similarity: 0.6,
    estimatedDaysToPeak: 10,
    pastPeakDay: 30,
    pastTotalDays: 60,
    ...overrides,
  }
}

describe('calculatePrediction', () => {
  it('returns null for empty comparisons', () => {
    expect(calculatePrediction('2026-01-01', [])).toBeNull()
  })

  it('returns null when all pastTotalDays < 2', () => {
    const comps = [
      makeComparison({ pastTotalDays: 1 }),
      makeComparison({ pastTotalDays: 0 }),
    ]
    expect(calculatePrediction('2026-01-01', comps)).toBeNull()
  })

  it('returns null when avgTotalDays < 3', () => {
    const comps = [makeComparison({ pastTotalDays: 2 })]
    expect(calculatePrediction('2026-01-01', comps, '2026-01-05')).toBeNull()
  })

  it('returns a valid result with sufficient data', () => {
    const comps = [
      makeComparison({ pastTheme: 'A', similarity: 0.7, pastPeakDay: 20, pastTotalDays: 50 }),
      makeComparison({ pastTheme: 'B', similarity: 0.5, pastPeakDay: 40, pastTotalDays: 80 }),
    ]
    const result = calculatePrediction('2026-01-01', comps, '2026-01-10')
    expect(result).not.toBeNull()
    expect(result!.comparisonCount).toBe(2)
    expect(result!.daysSinceSpike).toBe(9)
    expect(result!.avgSimilarity).toBe(0.6)
    expect(result!.avgPeakDay).toBeGreaterThan(0)
  })

  it('uses today param for deterministic daysSinceSpike', () => {
    const comps = [makeComparison()]
    const result = calculatePrediction('2026-01-01', comps, '2026-01-21')
    expect(result).not.toBeNull()
    expect(result!.daysSinceSpike).toBe(20)
  })

  it('sets daysSinceSpike to 0 when no firstSpikeDate', () => {
    const comps = [makeComparison()]
    const result = calculatePrediction(null, comps, '2026-01-10')
    expect(result).not.toBeNull()
    expect(result!.daysSinceSpike).toBe(0)
  })

  it('determines phase correctly for pre-peak', () => {
    // daysSinceSpike=5, avgPeakDay~30, avgTotalDays~60 → 5 < 30*0.7=21 → pre-peak
    const comps = [makeComparison({ pastPeakDay: 30, pastTotalDays: 60 })]
    const result = calculatePrediction('2026-01-01', comps, '2026-01-06')
    expect(result).not.toBeNull()
    expect(result!.phase).toBe('pre-peak')
  })

  it('determines confidence levels', () => {
    // 3 comps with avg similarity >= 0.55 → high
    const highComps = [
      makeComparison({ similarity: 0.6 }),
      makeComparison({ similarity: 0.6 }),
      makeComparison({ similarity: 0.6 }),
    ]
    const highResult = calculatePrediction('2026-01-01', highComps, '2026-01-10')
    expect(highResult!.confidence).toBe('high')

    // 1 comp with low similarity → low
    const lowComps = [makeComparison({ similarity: 0.3 })]
    const lowResult = calculatePrediction('2026-01-01', lowComps, '2026-01-10')
    expect(lowResult!.confidence).toBe('low')
  })

  it('sorts scenarios by totalDays (best=shortest, worst=longest)', () => {
    const comps = [
      makeComparison({ pastTheme: 'Short', pastTotalDays: 30, pastPeakDay: 10 }),
      makeComparison({ pastTheme: 'Mid', pastTotalDays: 60, pastPeakDay: 25 }),
      makeComparison({ pastTheme: 'Long', pastTotalDays: 90, pastPeakDay: 40 }),
    ]
    const result = calculatePrediction('2026-01-01', comps, '2026-01-10')
    expect(result).not.toBeNull()
    expect(result!.scenarios.best.themeName).toBe('Short')
    expect(result!.scenarios.worst.themeName).toBe('Long')
  })

  it('clamps currentProgress and peakProgress to [0, 100]', () => {
    // daysSinceSpike far exceeds avgTotalDays → currentProgress should be clamped at 100
    const comps = [makeComparison({ pastTotalDays: 10, pastPeakDay: 5 })]
    const result = calculatePrediction('2025-01-01', comps, '2026-01-10')
    expect(result).not.toBeNull()
    expect(result!.currentProgress).toBeLessThanOrEqual(100)
    expect(result!.peakProgress).toBeLessThanOrEqual(100)
    expect(result!.currentProgress).toBeGreaterThanOrEqual(0)
  })
})
