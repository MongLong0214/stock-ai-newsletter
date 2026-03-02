import { describe, it, expect } from 'vitest'
import { medianAbsoluteDeviation, robustZScore, median } from '../normalize'

describe('medianAbsoluteDeviation', () => {
  it('returns 0 for empty array', () => {
    expect(medianAbsoluteDeviation([])).toBe(0)
  })

  it('returns 0 for single value', () => {
    expect(medianAbsoluteDeviation([5])).toBe(0)
  })

  it('computes correct MAD for symmetric data', () => {
    // [1, 2, 3, 4, 5] → median=3, deviations=[0, 1, 1, 2, 2] → MAD=1
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBe(1)
  })

  it('is robust to outliers', () => {
    // Without outlier: [1,2,3,4,5] → MAD=1
    // With outlier: [1,2,3,4,100] → median=3, deviations=[1,2,0,1,97] → sorted=[0,1,1,2,97] → MAD=1
    const withOutlier = medianAbsoluteDeviation([1, 2, 3, 4, 100])
    const withoutOutlier = medianAbsoluteDeviation([1, 2, 3, 4, 5])
    expect(withOutlier).toBe(withoutOutlier)
  })
})

describe('robustZScore', () => {
  it('returns 0 when MAD is near zero', () => {
    expect(robustZScore(5, 5, 0)).toBe(0)
    expect(robustZScore(5, 5, 0.0001)).toBe(0)
  })

  it('returns 0 for value equal to median', () => {
    expect(robustZScore(5, 5, 2)).toBe(0)
  })

  it('returns positive z-score for value above median', () => {
    const z = robustZScore(10, 5, 2)
    expect(z).toBeGreaterThan(0)
  })

  it('returns negative z-score for value below median', () => {
    const z = robustZScore(1, 5, 2)
    expect(z).toBeLessThan(0)
  })

  it('uses consistency constant 1.4826', () => {
    // robustZScore = (value - median) / (MAD * 1.4826)
    const z = robustZScore(10, 5, 2)
    expect(z).toBeCloseTo((10 - 5) / (2 * 1.4826), 4)
  })
})

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0)
  })

  it('returns single value for array of one', () => {
    expect(median([42])).toBe(42)
  })

  it('returns middle value for odd-length sorted array', () => {
    expect(median([1, 3, 5])).toBe(3)
  })

  it('returns average of two middle values for even-length sorted array', () => {
    expect(median([1, 3, 5, 7])).toBe(4)
  })
})
