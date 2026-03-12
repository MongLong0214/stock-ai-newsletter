import { describe, it, expect } from 'vitest'
import {
  standardDeviation, avg, daysBetween,
  medianAbsoluteDeviation, robustZScore, median,
  sigmoid_normalize, log_normalize,
  linearRegressionSlope, calculateDVI,
} from '@/lib/tli/normalize'

describe('standardDeviation', () => {
  it('returns 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0)
  })

  it('returns 0 for single element', () => {
    expect(standardDeviation([5])).toBe(0)
  })

  it('returns 0 for identical values', () => {
    expect(standardDeviation([3, 3, 3, 3])).toBe(0)
  })

  it('calculates population std dev correctly', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, stddev=2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})

describe('avg', () => {
  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0)
  })

  it('returns the single value for one-element array', () => {
    expect(avg([42])).toBe(42)
  })

  it('calculates arithmetic mean', () => {
    expect(avg([10, 20, 30])).toBe(20)
    expect(avg([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('daysBetween', () => {
  it('returns days between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9)
  })

  it('returns negative for reversed dates', () => {
    expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9)
  })

  it('returns 0 for same date', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('returns 0 for invalid dates', () => {
    expect(daysBetween('invalid', '2026-01-01')).toBe(0)
    expect(daysBetween('2026-01-01', 'invalid')).toBe(0)
  })
})

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0)
  })

  it('returns the middle value for odd-length sorted array', () => {
    expect(median([1, 3, 5])).toBe(3)
    expect(median([10, 20, 30, 40, 50])).toBe(30)
  })

  it('returns average of two middles for even-length sorted array', () => {
    expect(median([1, 3, 5, 7])).toBe(4)
    expect(median([2, 4])).toBe(3)
  })

  it('works for single element', () => {
    expect(median([42])).toBe(42)
  })
})

describe('medianAbsoluteDeviation', () => {
  it('returns 0 for empty array', () => {
    expect(medianAbsoluteDeviation([])).toBe(0)
  })

  it('returns 0 for identical values', () => {
    expect(medianAbsoluteDeviation([5, 5, 5, 5])).toBe(0)
  })

  it('computes MAD correctly for [1, 2, 3, 4, 5] → median=3, MAD=1', () => {
    // deviations: [2, 1, 0, 1, 2] → sorted: [0, 1, 1, 2, 2] → median=1
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBe(1)
  })

  it('is robust to outliers', () => {
    const clean = medianAbsoluteDeviation([1, 2, 3, 4, 5])
    const withOutlier = medianAbsoluteDeviation([1, 2, 3, 4, 1000])
    // MAD is much less affected by outlier than standard deviation
    expect(withOutlier).toBeLessThan(clean * 5)
  })
})

describe('robustZScore', () => {
  it('returns 0 when scaledMAD < 0.001 (near-constant distribution)', () => {
    expect(robustZScore(5, 5, 0)).toBe(0)
    expect(robustZScore(10, 5, 0.0005)).toBe(0)
  })

  it('returns 0 when value equals median', () => {
    expect(robustZScore(10, 10, 2)).toBe(0)
  })

  it('returns positive z-score for value above median', () => {
    const z = robustZScore(20, 10, 3)
    expect(z).toBeGreaterThan(0)
  })

  it('returns negative z-score for value below median', () => {
    const z = robustZScore(5, 10, 3)
    expect(z).toBeLessThan(0)
  })

  it('uses MAD consistency constant 1.4826', () => {
    // scaledMAD = mad * 1.4826; z = (value - med) / scaledMAD
    const z = robustZScore(15, 10, 3) // (15-10) / (3*1.4826)
    expect(z).toBeCloseTo(5 / (3 * 1.4826), 5)
  })
})

describe('sigmoid_normalize', () => {
  it('returns 0.5 for value at center', () => {
    expect(sigmoid_normalize(5, 5, 2)).toBeCloseTo(0.5, 5)
  })

  it('returns 0.5 for non-finite value', () => {
    expect(sigmoid_normalize(Infinity, 5, 2)).toBe(0.5)
    expect(sigmoid_normalize(NaN, 5, 2)).toBe(0.5)
  })

  it('returns 0.5 for scale <= 0', () => {
    expect(sigmoid_normalize(10, 5, 0)).toBe(0.5)
    expect(sigmoid_normalize(10, 5, -1)).toBe(0.5)
  })

  it('returns > 0.5 for value above center', () => {
    expect(sigmoid_normalize(10, 5, 2)).toBeGreaterThan(0.5)
  })

  it('returns < 0.5 for value below center', () => {
    expect(sigmoid_normalize(0, 5, 2)).toBeLessThan(0.5)
  })

  it('result is always in (0, 1)', () => {
    expect(sigmoid_normalize(10, 5, 2)).toBeLessThan(1)
    expect(sigmoid_normalize(0, 5, 2)).toBeGreaterThan(0)
  })
})

describe('log_normalize', () => {
  it('returns 0 for scale <= 0', () => {
    expect(log_normalize(5, 0)).toBe(0)
    expect(log_normalize(5, -1)).toBe(0)
  })

  it('returns 0 for negative value', () => {
    expect(log_normalize(-1, 10)).toBe(0)
  })

  it('returns 0 for non-finite value', () => {
    expect(log_normalize(Infinity, 10)).toBe(0)
  })

  it('returns 1 when value equals scale', () => {
    expect(log_normalize(10, 10)).toBe(1)
  })

  it('clamps at 1 for value > scale', () => {
    expect(log_normalize(100, 10)).toBe(1)
  })

  it('returns value in [0, 1]', () => {
    for (const v of [0, 1, 5, 10, 50]) {
      const result = log_normalize(v, 10)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(1)
    }
  })
})

describe('linearRegressionSlope', () => {
  it('returns 0 for empty or single-element array', () => {
    expect(linearRegressionSlope([])).toBe(0)
    expect(linearRegressionSlope([5])).toBe(0)
  })

  it('returns 0 for constant series', () => {
    expect(linearRegressionSlope([3, 3, 3, 3])).toBe(0)
  })

  it('returns positive slope for increasing series', () => {
    expect(linearRegressionSlope([1, 2, 3, 4, 5])).toBeGreaterThan(0)
  })

  it('returns negative slope for decreasing series', () => {
    expect(linearRegressionSlope([5, 4, 3, 2, 1])).toBeLessThan(0)
  })

  it('returns 1 for perfectly linear [0, 1, 2, 3, 4]', () => {
    expect(linearRegressionSlope([0, 1, 2, 3, 4])).toBeCloseTo(1, 5)
  })

  it('returns 2 for perfectly linear [0, 2, 4, 6, 8]', () => {
    expect(linearRegressionSlope([0, 2, 4, 6, 8])).toBeCloseTo(2, 5)
  })
})

describe('calculateDVI', () => {
  it('returns 0.5 for constant series (no moves)', () => {
    expect(calculateDVI([5, 5, 5, 5])).toBe(0.5)
  })

  it('returns 1.0 for purely rising series (no down moves)', () => {
    expect(calculateDVI([1, 2, 3, 4, 5])).toBe(1.0)
  })

  it('returns 0 when no up moves (all decreasing)', () => {
    // avgUp = 0, avgDown > 0 → rs = 0 → 1 - 1/(1+0) = 0
    expect(calculateDVI([5, 4, 3, 2, 1])).toBe(0)
  })

  it('returns value in [0, 1]', () => {
    const mixed = [3, 5, 2, 7, 4, 8, 1]
    const result = calculateDVI(mixed)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('returns > 0.5 for predominantly rising series', () => {
    expect(calculateDVI([1, 2, 3, 2, 4, 5, 6])).toBeGreaterThan(0.5)
  })
})
