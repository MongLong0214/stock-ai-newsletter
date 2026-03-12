import { describe, it, expect } from 'vitest'
import {
  pearsonCorrelation,
  cosineSimilarity,
  zScoreEuclideanSimilarity,
  keywordJaccard,
} from '../comparison/similarity'

describe('pearsonCorrelation', () => {
  it('returns 0 when fewer than 7 data points', () => {
    expect(pearsonCorrelation([1, 2, 3], [4, 5, 6])).toBe(0)
  })

  it('returns ~1 for perfectly correlated arrays', () => {
    const x = [1, 2, 3, 4, 5, 6, 7]
    const y = [2, 4, 6, 8, 10, 12, 14]
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 5)
  })

  it('returns ~-1 for perfectly inversely correlated arrays', () => {
    const x = [1, 2, 3, 4, 5, 6, 7]
    const y = [14, 12, 10, 8, 6, 4, 2]
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 5)
  })

  it('returns 0 for constant arrays (stddev < 0.005)', () => {
    const x = [5, 5, 5, 5, 5, 5, 5]
    const y = [1, 2, 3, 4, 5, 6, 7]
    expect(pearsonCorrelation(x, y)).toBe(0)
  })

  it('truncates to shorter array length', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const y = [2, 4, 6, 8, 10, 12, 14]
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 5)
  })

  it('handles uncorrelated data with value near 0', () => {
    const x = [1, 3, 2, 5, 4, 7, 6]
    const y = [6, 4, 7, 2, 5, 1, 3]
    const r = pearsonCorrelation(x, y)
    expect(Math.abs(r)).toBeLessThan(1)
  })
})

describe('cosineSimilarity', () => {
  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })

  it('returns 1 for proportional vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })
})

describe('zScoreEuclideanSimilarity', () => {
  const stats = { means: [0.5, 0.5, 0.5], stddevs: [0.2, 0.2, 0.2] }

  it('returns 0 for mismatched lengths', () => {
    expect(zScoreEuclideanSimilarity([1, 2], [1, 2, 3], stats)).toBe(0)
  })

  it('returns 0 for empty arrays', () => {
    expect(zScoreEuclideanSimilarity([], [], stats)).toBe(0)
  })

  it('returns 1 for identical vectors', () => {
    expect(zScoreEuclideanSimilarity([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], stats)).toBeCloseTo(1, 5)
  })

  it('returns value between 0 and 1 for different vectors', () => {
    const sim = zScoreEuclideanSimilarity([0.3, 0.7, 0.5], [0.8, 0.2, 0.9], stats)
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThan(1)
  })

  it('uses fallback stddev=1 when stddev is near zero', () => {
    const zeroStats = { means: [0.5, 0.5], stddevs: [0.0001, 0.2] }
    const sim = zScoreEuclideanSimilarity([0.5, 0.5], [0.5, 0.5], zeroStats)
    expect(sim).toBeCloseTo(1, 5)
  })
})

describe('keywordJaccard', () => {
  it('returns 0 for two empty sets', () => {
    expect(keywordJaccard([], [])).toBe(0)
  })

  it('returns 0 for disjoint sets', () => {
    expect(keywordJaccard(['a', 'b'], ['c', 'd'])).toBe(0)
  })

  it('returns 1 for identical sets', () => {
    expect(keywordJaccard(['a', 'b'], ['a', 'b'])).toBe(1)
  })

  it('is case-insensitive', () => {
    expect(keywordJaccard(['AI', 'Robot'], ['ai', 'robot'])).toBe(1)
  })

  it('calculates partial overlap correctly', () => {
    // intersection=1 (a), union=3 (a,b,c)
    expect(keywordJaccard(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3, 5)
  })

  it('handles one empty set', () => {
    expect(keywordJaccard(['a'], [])).toBe(0)
  })

  it('downweights generic overlaps relative to rare overlaps when support counts are provided', () => {
    const supportCounts = new Map<string, number>([
      ['테마', 100],
      ['관련주', 80],
      ['hbm', 2],
    ])

    const generic = keywordJaccard(['테마', '관련주'], ['테마'], { supportCounts })
    const rare = keywordJaccard(['HBM'], ['hbm'], { supportCounts })

    expect(rare).toBeGreaterThan(generic)
  })
})
