import { describe, it, expect } from 'vitest'
import { extractFeatures, featuresToArray, classifySector } from '../comparison/features'

describe('extractFeatures', () => {
  it('returns defaults for empty inputs', () => {
    const result = extractFeatures({
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
    })
    // sigmoid_normalize(0, 30, 20) ≈ 0.182 for interestLevel fallback
    expect(result.interestLevel).toBeGreaterThan(0)
    expect(result.interestLevel).toBeLessThan(0.5)
    // no data → slope=0 → sigmoid(0,0,1.5)=0.5
    expect(result.interestMomentum).toBeCloseTo(0.5)
    // no deltas → DVI=0.5
    expect(result.volatilityDVI).toBeCloseTo(0.5)
    expect(result.newsIntensity).toBe(0)
    expect(result.activeDaysNorm).toBe(0)
    // sigmoid(0, 0, 5) = 0.5
    expect(result.priceChangePct).toBeCloseTo(0.5)
    expect(result.volumeIntensity).toBe(0)
  })

  it('uses provided interestLevel over sigmoid fallback', () => {
    const result = extractFeatures({
      interestValues: [10, 20, 30],
      totalNewsCount: 0,
      activeDays: 0,
      interestLevel: 0.85,
    })
    expect(result.interestLevel).toBe(0.85)
  })

  it('computes interestMomentum from slope', () => {
    // rising values: slope > 0 → sigmoid > 0.5
    const rising = extractFeatures({
      interestValues: [10, 20, 30, 40, 50, 60, 70],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(rising.interestMomentum).toBeGreaterThan(0.5)

    // falling values: slope < 0 → sigmoid < 0.5
    const falling = extractFeatures({
      interestValues: [70, 60, 50, 40, 30, 20, 10],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(falling.interestMomentum).toBeLessThan(0.5)
  })

  it('computes DVI from directional volatility', () => {
    // pure upward movement → DVI = 1.0
    const up = extractFeatures({
      interestValues: [10, 20, 30, 40],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(up.volatilityDVI).toBeCloseTo(1.0)

    // pure downward movement → DVI = 0
    const down = extractFeatures({
      interestValues: [40, 30, 20, 10],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(down.volatilityDVI).toBeCloseTo(0)
  })

  it('computes newsIntensity with log normalization', () => {
    const result = extractFeatures({
      interestValues: [],
      totalNewsCount: 100,
      activeDays: 0,
    })
    // log_normalize(100, 100) = log(101)/log(101) = 1.0
    expect(result.newsIntensity).toBeCloseTo(1.0)
  })

  it('caps activeDaysNorm at 1 for 365+ days', () => {
    const result = extractFeatures({
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 730,
    })
    expect(result.activeDaysNorm).toBe(1)
  })

  it('computes priceChangePct with sigmoid', () => {
    // positive price change → > 0.5
    const up = extractFeatures({
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
      avgPriceChangePct: 10,
    })
    expect(up.priceChangePct).toBeGreaterThan(0.5)

    // negative price change → < 0.5
    const down = extractFeatures({
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
      avgPriceChangePct: -10,
    })
    expect(down.priceChangePct).toBeLessThan(0.5)
  })

  it('computes volumeIntensity with log normalization', () => {
    const result = extractFeatures({
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
      avgVolume: 50_000_000,
    })
    // log_normalize(50M, 50M) = 1.0
    expect(result.volumeIntensity).toBeCloseTo(1.0)
  })
})

describe('featuresToArray', () => {
  it('returns features in correct order', () => {
    const features = {
      interestLevel: 0.1,
      interestMomentum: 0.2,
      volatilityDVI: 0.3,
      newsIntensity: 0.4,
      activeDaysNorm: 0.5,
      priceChangePct: 0.6,
      volumeIntensity: 0.7,
    }
    expect(featuresToArray(features)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])
  })
})

describe('classifySector', () => {
  it('returns "etc" for empty keywords', () => {
    expect(classifySector([])).toBe('etc')
  })

  it('returns "etc" for unmatched keywords', () => {
    expect(classifySector(['떡볶이', '라면'])).toBe('etc')
  })

  it('classifies semiconductor keywords', () => {
    expect(classifySector(['HBM', 'DRAM', '파운드리'])).toBe('반도체')
  })

  it('classifies AI keywords', () => {
    expect(classifySector(['AI', 'GPU', '데이터센터'])).toBe('AI')
  })

  it('picks sector with most keyword matches', () => {
    expect(classifySector(['HBM', 'DRAM', 'GPU'])).toBe('반도체')
  })

  it('is case-insensitive via includes', () => {
    expect(classifySector(['hbm'])).toBe('반도체')
  })
})
