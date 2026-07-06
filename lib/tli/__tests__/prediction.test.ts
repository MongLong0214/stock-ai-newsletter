import { describe, it, expect } from 'vitest'
import { calculatePrediction } from '@/lib/tli/prediction'
import { makeComparison, makeTriple, requirePrediction } from './prediction-fixtures'

describe('calculatePrediction', () => {
  it('returns null for empty comparisons', () => {
    expect(calculatePrediction('2026-01-01', [])).toBeNull()
  })

  it('returns null when all pastTotalDays < 14 (품질 게이트)', () => {
    const comps = [
      makeComparison({ pastTotalDays: 13 }),
      makeComparison({ pastTotalDays: 1 }),
    ]
    expect(calculatePrediction('2026-01-01', comps)).toBeNull()
  })

  it('returns null when all pastPeakDay < 3 (아티팩트 필터)', () => {
    const comps = [
      makeComparison({ pastPeakDay: 1, pastTotalDays: 30 }),
      makeComparison({ pastPeakDay: 2, pastTotalDays: 40 }),
    ]
    expect(calculatePrediction('2026-01-01', comps)).toBeNull()
  })

  it('returns null when only 2 valid comparisons (최소 3개 필요)', () => {
    const comps = [
      makeComparison({ pastTotalDays: 14, pastPeakDay: 5 }),
      makeComparison({ pastTheme: 'B', pastTotalDays: 14, pastPeakDay: 5 }),
    ]
    expect(calculatePrediction('2026-01-01', comps, '2026-01-05')).toBeNull()
  })

  it('pastTotalDays=14, pastPeakDay=5는 품질 게이트를 통과한다 (최소 3개)', () => {
    const comps = makeTriple({ pastTotalDays: 14, pastPeakDay: 5 })
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-05'))
    expect(result.comparisonCount).toBe(3)
  })

  it('pastTotalDays=13은 필터링되고 유효 2개면 null 반환', () => {
    // Only 2 valid after filtering → returns null (min 3)
    const comps = [
      makeComparison({ pastTheme: 'Short', pastTotalDays: 13, pastPeakDay: 5 }),
      makeComparison({ pastTheme: 'Valid1', pastTotalDays: 14, pastPeakDay: 7, similarity: 0.7 }),
      makeComparison({ pastTheme: 'Valid2', pastTotalDays: 20, pastPeakDay: 8, similarity: 0.5 }),
    ]
    const result = calculatePrediction('2026-01-01', comps, '2026-01-05')
    expect(result).toBeNull()
  })

  it('pastTotalDays=13 필터링 후 유효 3개는 통과', () => {
    const comps = [
      makeComparison({ pastTheme: 'Short', pastTotalDays: 13, pastPeakDay: 5 }),
      makeComparison({ pastTheme: 'Valid1', pastTotalDays: 14, pastPeakDay: 7, similarity: 0.7 }),
      makeComparison({ pastTheme: 'Valid2', pastTotalDays: 20, pastPeakDay: 8, similarity: 0.5 }),
      makeComparison({ pastTheme: 'Valid3', pastTotalDays: 25, pastPeakDay: 10, similarity: 0.6 }),
    ]
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-05'))
    expect(result.comparisonCount).toBe(3)
  })

  it('returns null when avgTotalDays < 3', () => {
    const comps = [makeComparison({ pastTotalDays: 2 }), makeComparison({ pastTotalDays: 2 })]
    expect(calculatePrediction('2026-01-01', comps, '2026-01-05')).toBeNull()
  })

  it('returns null when avgSimilarity < 0.40 (유사도 게이트)', () => {
    const comps = [
      makeComparison({ similarity: 0.35, pastPeakDay: 10 }),
      makeComparison({ similarity: 0.35, pastPeakDay: 10 }),
    ]
    expect(calculatePrediction('2026-01-01', comps, '2026-01-05')).toBeNull()
  })

  it('returns a valid result with sufficient data', () => {
    const comps = [
      makeComparison({ pastTheme: 'A', similarity: 0.7, pastPeakDay: 20, pastTotalDays: 50 }),
      makeComparison({ pastTheme: 'B', similarity: 0.5, pastPeakDay: 40, pastTotalDays: 80 }),
      makeComparison({ pastTheme: 'C', similarity: 0.6, pastPeakDay: 30, pastTotalDays: 65 }),
    ]
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-10'))
    expect(result.comparisonCount).toBe(3)
    expect(result.daysSinceSpike).toBe(9)
    expect(result.avgSimilarity).toBeCloseTo(0.6, 3)
    expect(result.avgPeakDay).toBeGreaterThan(0)
  })

  it('includes bootstrap predictionIntervals when 3+ comparisons present', () => {
    const comps = [
      makeComparison({ pastTheme: 'A', similarity: 0.7, pastPeakDay: 20, pastTotalDays: 50 }),
      makeComparison({ pastTheme: 'B', similarity: 0.6, pastPeakDay: 30, pastTotalDays: 60 }),
      makeComparison({ pastTheme: 'C', similarity: 0.5, pastPeakDay: 40, pastTotalDays: 80 }),
    ]
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-10'))
    const intervals = result.predictionIntervals
    expect(intervals).toBeDefined()
    if (!intervals) throw new Error('Expected prediction intervals')
    const peakInterval = intervals.peakDay
    expect(peakInterval).not.toBeNull()
    expect(intervals.totalDays).not.toBeNull()
    if (peakInterval === null) throw new Error('Expected peak interval')
    expect(peakInterval.lower).toBeLessThanOrEqual(peakInterval.median)
    expect(peakInterval.median).toBeLessThanOrEqual(peakInterval.upper)
    expect(peakInterval.confidenceLevel).toBe(0.9)
  })

  it('uses today param for deterministic daysSinceSpike', () => {
    const comps = makeTriple()
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-21'))
    expect(result.daysSinceSpike).toBe(20)
  })

  it('returns null when no firstSpikeDate is available', () => {
    const comps = makeTriple()
    const result = calculatePrediction(null, comps, '2026-01-10')
    expect(result).toBeNull()
  })

  it('daysSinceSpike는 365일로 캡핑된다', () => {
    const comps = makeTriple()
    const result = requirePrediction(calculatePrediction('2024-01-01', comps, '2026-01-10'))
    expect(result.daysSinceSpike).toBe(365)
  })

  it('determines phase correctly for rising', () => {
    // daysSinceSpike=5, avgPeakDay~30 → 5 < 30*0.9=27 → rising
    const comps = makeTriple({ pastPeakDay: 30, pastTotalDays: 60 })
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-06'))
    expect(result.phase).toBe('rising')
  })

  it('determines phase correctly for hot', () => {
    // daysSinceSpike=29, avgPeakDay~30 → 29 >= 27 AND 29 <= 33 → hot
    const comps = makeTriple({ pastPeakDay: 30, pastTotalDays: 60 })
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-01-30'))
    expect(result.phase).toBe('hot')
  })

  it('determines phase correctly for cooling', () => {
    // daysSinceSpike=40, avgPeakDay~30 → 40 > 33 → cooling
    const comps = makeTriple({ pastPeakDay: 30, pastTotalDays: 60 })
    const result = requirePrediction(calculatePrediction('2026-01-01', comps, '2026-02-10'))
    expect(result.phase).toBe('cooling')
  })

  it('describes Cooling as current state rather than a forward-looking prediction', () => {
    const comps = makeTriple({ pastPeakDay: 30, pastTotalDays: 60 })
    const result = calculatePrediction('2026-01-01', comps, '2026-02-10')

    expect(result?.phase).toBe('cooling')
    expect(result?.phaseMessage).toContain('관심도 둔화 구간')
    expect(result?.phaseMessage).not.toContain('가능성')
    expect(result?.phaseMessage).not.toContain('남음')
  })

  it('determines confidence levels', () => {
    // 5개 + avg >= 0.55 → high
    const highComps = Array.from({ length: 5 }, (_, i) =>
      makeComparison({ pastTheme: `H${i}`, similarity: 0.6 }),
    )
    const highResult = calculatePrediction('2026-01-01', highComps, '2026-01-10')
    expect(highResult?.confidence).toBe('high')

    // 3개 + avg >= 0.40 but < 5 또는 sim < 0.55 → medium
    const medComps = [
      makeComparison({ similarity: 0.45 }),
      makeComparison({ pastTheme: 'M2', similarity: 0.45 }),
      makeComparison({ pastTheme: 'M3', similarity: 0.45 }),
    ]
    const mediumResult = calculatePrediction('2026-01-01', medComps, '2026-01-10')
    expect(mediumResult?.confidence).toBe('medium')

    // 유사도 < 0.40이면 null 반환
    const lowComps = [
      makeComparison({ similarity: 0.3 }),
      makeComparison({ pastTheme: 'L2', similarity: 0.3 }),
      makeComparison({ pastTheme: 'L3', similarity: 0.3 }),
    ]
    expect(calculatePrediction('2026-01-01', lowComps, '2026-01-10')).toBeNull()
  })

})
