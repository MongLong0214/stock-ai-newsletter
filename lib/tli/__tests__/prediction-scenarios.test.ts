import { describe, expect, it } from 'vitest'
import { calculatePrediction } from '@/lib/tli/prediction'
import { makeComparison, makeTriple, requirePrediction } from './prediction-fixtures'

describe('calculatePrediction scenarios', () => {
  it('does not let the current stage override comparison-based phase', () => {
    const comps = makeTriple({
      pastPeakDay: 30,
      pastTotalDays: 60,
      estimatedDaysToPeak: 25,
    })

    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-06', 82, 'Peak'))

    expect(result.phase).toBe('rising')
    expect(result.riskLevel).toBe('low')
  })

  it('keeps the narrative aligned to comparison timing instead of score thresholds', () => {
    const comps = makeTriple({
      pastPeakDay: 30,
      pastTotalDays: 60,
      estimatedDaysToPeak: 25,
    })

    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-06', 82, 'Peak'))

    expect(result.phaseMessage).toContain('정점까지 약 25일 남음')
    expect(result.phaseMessage).not.toContain('정점 구간 통과 중')
    expect(result.keyInsight).toContain('상승 단계')
  })

  it('sorts scenarios by totalDays (best=shortest, worst=longest)', () => {
    const comps = [
      makeComparison({ pastTheme: 'Short', pastTotalDays: 30, pastPeakDay: 10 }),
      makeComparison({ pastTheme: 'Mid', pastTotalDays: 60, pastPeakDay: 25 }),
      makeComparison({ pastTheme: 'Long', pastTotalDays: 90, pastPeakDay: 40 }),
    ]
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-10'))
    expect(result.scenarios.best.themeName).toBe('Short')
    expect(result.scenarios.worst.themeName).toBe('Long')
  })

  it('uses representative quartile scenarios instead of raw extremes when enough comparisons exist', () => {
    const comps = [
      makeComparison({ pastTheme: 'Fastest', pastTotalDays: 20, pastPeakDay: 8 }),
      makeComparison({ pastTheme: 'Fast', pastTotalDays: 40, pastPeakDay: 15 }),
      makeComparison({ pastTheme: 'Typical', pastTotalDays: 60, pastPeakDay: 24 }),
      makeComparison({ pastTheme: 'Late', pastTotalDays: 300, pastPeakDay: 120 }),
      makeComparison({ pastTheme: 'Latest', pastTotalDays: 365, pastPeakDay: 150 }),
    ]

    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-10'))

    expect(result.scenarios.best.themeName).toBe('Fast')
    expect(result.scenarios.median.themeName).toBe('Typical')
    expect(result.scenarios.worst.themeName).toBe('Late')
  })

  it('clamps currentProgress and peakProgress to [0, 100]', () => {
    const comps = makeTriple({ pastTotalDays: 20, pastPeakDay: 5 })
    const result = requirePrediction(calculatePrediction('2025-01-01', comps, '2026-01-10'))
    expect(result.currentProgress).toBeLessThanOrEqual(100)
    expect(result.peakProgress).toBeLessThanOrEqual(100)
    expect(result.currentProgress).toBeGreaterThanOrEqual(0)
  })
})
