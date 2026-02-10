import { describe, it, expect } from 'vitest'
import { extractFeatures, featuresToArray, classifySector } from '../comparison/features'

describe('extractFeatures', () => {
  it('returns all zeros for empty inputs', () => {
    const result = extractFeatures({
      scores: [],
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(result.growthRate).toBe(0.5) // (0+1)/2 = 0.5 when no growth
    expect(result.volatility).toBe(0)
    expect(result.newsIntensity).toBe(0)
    expect(result.scoreLevel).toBe(0)
    expect(result.activeDaysNorm).toBe(0)
  })

  it('calculates growthRate from recent vs older scores', () => {
    // recent 7: avg=60, older 7: avg=30 → rawGrowth=(60-30)/30=1 → (1+1)/2=1.0
    const scores = [
      ...Array(7).fill({ score: 60 }),
      ...Array(7).fill({ score: 30 }),
    ]
    const result = extractFeatures({ scores, interestValues: [], totalNewsCount: 0, activeDays: 0 })
    expect(result.growthRate).toBeCloseTo(1.0)
  })

  it('clamps growthRate to [0, 1]', () => {
    // Declining: recent=10, older=100 → rawGrowth=(10-100)/100=-0.9 → (-0.9+1)/2=0.05
    const scores = [
      ...Array(7).fill({ score: 10 }),
      ...Array(7).fill({ score: 100 }),
    ]
    const result = extractFeatures({ scores, interestValues: [], totalNewsCount: 0, activeDays: 0 })
    expect(result.growthRate).toBeGreaterThanOrEqual(0)
    expect(result.growthRate).toBeLessThanOrEqual(1)
  })

  it('uses recentAvg as olderAvg when fewer than 8 scores', () => {
    const scores = [{ score: 50 }, { score: 60 }]
    const result = extractFeatures({ scores, interestValues: [], totalNewsCount: 0, activeDays: 0 })
    // olderScores empty → olderAvg = recentAvg → rawGrowth=0 → growthRate=0.5
    expect(result.growthRate).toBeCloseTo(0.5)
  })

  it('calculates volatility from interest values', () => {
    // stddev of [0, 50] ≈ 25 → 25/50 = 0.5
    const result = extractFeatures({
      scores: [],
      interestValues: [0, 50],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(result.volatility).toBeCloseTo(0.5)
  })

  it('caps volatility at 1', () => {
    const result = extractFeatures({
      scores: [],
      interestValues: [0, 200],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(result.volatility).toBeLessThanOrEqual(1)
  })

  it('caps newsIntensity at 1', () => {
    const result = extractFeatures({
      scores: [],
      interestValues: [],
      totalNewsCount: 500,
      activeDays: 0,
    })
    expect(result.newsIntensity).toBe(1)
  })

  it('calculates scoreLevel from first score', () => {
    const result = extractFeatures({
      scores: [{ score: 75 }, { score: 50 }],
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 0,
    })
    expect(result.scoreLevel).toBeCloseTo(0.75)
  })

  it('caps activeDaysNorm at 1 for 365+ days', () => {
    const result = extractFeatures({
      scores: [],
      interestValues: [],
      totalNewsCount: 0,
      activeDays: 730,
    })
    expect(result.activeDaysNorm).toBe(1)
  })
})

describe('featuresToArray', () => {
  it('returns features in correct order', () => {
    const features = {
      growthRate: 0.1,
      volatility: 0.2,
      newsIntensity: 0.3,
      scoreLevel: 0.4,
      activeDaysNorm: 0.5,
    }
    expect(featuresToArray(features)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
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
    // 2 matches for 반도체 (HBM, DRAM), 1 for AI (GPU)
    expect(classifySector(['HBM', 'DRAM', 'GPU'])).toBe('반도체')
  })

  it('is case-insensitive via includes', () => {
    expect(classifySector(['hbm'])).toBe('반도체')
  })
})
