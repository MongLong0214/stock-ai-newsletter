import { describe, expect, it } from 'vitest'
import {
  // CMPV4-016: Experimental Queue A
  unifyCurveScale,
  applySigmoidWeightSmoothing,
  buildSectorAffinityMatrix,
  createExperimentVersion,
  // CMPV4-016 supplement: length ratio penalty
  applyLengthRatioPenalty,
  // CMPV4-017: Experimental Queue B
  normalizeInactiveThemeNewsSnapshot,
  computeVIFDiagnostic,
  mutualRankExplicitFallback,
  MUTUAL_RANK_MIN_THEMES,
} from '../research/comparison-v4-experiments'

// ── CMPV4-016: curve scale unification ──

describe('CMPV4-016: curve scale unification', () => {
  it('normalizes curves to [0, 1] range regardless of original scale', () => {
    const raw = [10, 50, 100, 30, 5]
    const unified = unifyCurveScale(raw)

    expect(unified.length).toBe(raw.length)
    expect(Math.max(...unified)).toBeCloseTo(1)
    expect(Math.min(...unified)).toBeCloseTo(0)
  })

  it('handles constant curve (all same value)', () => {
    const raw = [42, 42, 42]
    const unified = unifyCurveScale(raw)

    expect(unified).toEqual([0, 0, 0])
  })

  it('handles empty curve', () => {
    const unified = unifyCurveScale([])
    expect(unified).toEqual([])
  })

  it('handles single point', () => {
    const unified = unifyCurveScale([50])
    expect(unified).toEqual([0])
  })
})

// ── CMPV4-016: sigmoid weight smoothing ──

describe('CMPV4-016: sigmoid weight smoothing', () => {
  it('applies sigmoid smoothing to pillar weights based on data quality', () => {
    const result = applySigmoidWeightSmoothing({
      featureWeight: 0.40,
      curveWeight: 0.60,
      curveDataDays: 30,
      transitionCenter: 14,
      transitionSteepness: 0.5,
    })

    expect(result.smoothedFeatureWeight).toBeGreaterThan(0)
    expect(result.smoothedCurveWeight).toBeGreaterThan(0)
    expect(result.smoothedFeatureWeight + result.smoothedCurveWeight).toBeCloseTo(1)
  })

  it('gives more weight to features when curve data is sparse', () => {
    const result = applySigmoidWeightSmoothing({
      featureWeight: 0.40,
      curveWeight: 0.60,
      curveDataDays: 3,
      transitionCenter: 14,
      transitionSteepness: 0.5,
    })

    expect(result.smoothedFeatureWeight).toBeGreaterThan(result.smoothedCurveWeight)
  })

  it('gives more weight to curves when curve data is abundant', () => {
    const result = applySigmoidWeightSmoothing({
      featureWeight: 0.40,
      curveWeight: 0.60,
      curveDataDays: 60,
      transitionCenter: 14,
      transitionSteepness: 0.5,
    })

    expect(result.smoothedCurveWeight).toBeGreaterThan(result.smoothedFeatureWeight)
  })
})

// ── CMPV4-016: sector affinity matrix ──

describe('CMPV4-016: sector affinity matrix', () => {
  it('returns 1.0 for same-sector comparison', () => {
    const matrix = buildSectorAffinityMatrix()
    expect(matrix.getAffinity('tech', 'tech')).toBe(1.0)
  })

  it('returns a value between 0 and 1 for cross-sector comparison', () => {
    const matrix = buildSectorAffinityMatrix()
    const affinity = matrix.getAffinity('tech', 'finance')
    expect(affinity).toBeGreaterThanOrEqual(0)
    expect(affinity).toBeLessThanOrEqual(1)
  })

  it('returns default affinity for unknown sectors', () => {
    const matrix = buildSectorAffinityMatrix()
    const affinity = matrix.getAffinity('unknown-sector', 'tech')
    expect(affinity).toBeGreaterThanOrEqual(0)
    expect(affinity).toBeLessThanOrEqual(1)
  })

  it('is symmetric', () => {
    const matrix = buildSectorAffinityMatrix()
    expect(matrix.getAffinity('tech', 'bio')).toBe(matrix.getAffinity('bio', 'tech'))
  })
})

// ── CMPV4-016: experiment version isolation ──

describe('CMPV4-016: experiment version isolation', () => {
  it('creates an isolated experiment version tag', () => {
    const version = createExperimentVersion({
      baseVersion: 'v4.0',
      experimentId: 'sigmoid-smoothing',
      runDate: '2026-03-11',
    })

    expect(version).toContain('v4.0')
    expect(version).toContain('sigmoid-smoothing')
    expect(version).toContain('2026-03-11')
  })

  it('produces unique versions for different experiments', () => {
    const v1 = createExperimentVersion({ baseVersion: 'v4.0', experimentId: 'exp-a', runDate: '2026-03-11' })
    const v2 = createExperimentVersion({ baseVersion: 'v4.0', experimentId: 'exp-b', runDate: '2026-03-11' })
    expect(v1).not.toBe(v2)
  })
})

// ── PRD §14.2 #4: length ratio penalty ──

describe('CMPV4-016: length ratio penalty', () => {
  it('returns no penalty when lengths are similar', () => {
    const result = applyLengthRatioPenalty({
      currentCurveLength: 30,
      pastCurveLength: 35,
      maxRatio: 3.0,
      penaltyWeight: 0.2,
    })

    expect(result.penalty).toBeCloseTo(0, 1)
    expect(result.adjustedSimilarity).toBeUndefined()
  })

  it('applies penalty when length ratio exceeds threshold', () => {
    const result = applyLengthRatioPenalty({
      currentCurveLength: 10,
      pastCurveLength: 100,
      maxRatio: 3.0,
      penaltyWeight: 0.2,
    })

    expect(result.penalty).toBeGreaterThan(0)
    expect(result.ratio).toBe(10) // 100/10 = 10
  })

  it('caps penalty at penaltyWeight', () => {
    const result = applyLengthRatioPenalty({
      currentCurveLength: 1,
      pastCurveLength: 1000,
      maxRatio: 3.0,
      penaltyWeight: 0.2,
    })

    expect(result.penalty).toBeLessThanOrEqual(0.2)
  })

  it('computes adjustedSimilarity when baseSimilarity is provided', () => {
    const result = applyLengthRatioPenalty({
      currentCurveLength: 10,
      pastCurveLength: 100,
      maxRatio: 3.0,
      penaltyWeight: 0.2,
      baseSimilarity: 0.8,
    })

    expect(result.adjustedSimilarity).toBeDefined()
    expect(result.adjustedSimilarity!).toBeLessThan(0.8)
    expect(result.adjustedSimilarity!).toBeGreaterThanOrEqual(0)
  })

  it('returns zero penalty when either length is zero', () => {
    const result = applyLengthRatioPenalty({
      currentCurveLength: 0,
      pastCurveLength: 30,
      maxRatio: 3.0,
      penaltyWeight: 0.2,
    })

    expect(result.penalty).toBe(0)
    expect(result.ratio).toBe(0)
  })
})

// ── CMPV4-017: inactive-theme news snapshot normalization ──

describe('CMPV4-017: inactive-theme news snapshot normalization', () => {
  it('normalizes news count relative to active period', () => {
    const result = normalizeInactiveThemeNewsSnapshot({
      rawNewsCount: 50,
      activeDays: 30,
      lookbackDays: 90,
    })

    expect(result.normalizedCount).toBeCloseTo(50 * (30 / 90))
    expect(result.scaleFactor).toBeCloseTo(30 / 90)
  })

  it('returns raw count when active days equals lookback', () => {
    const result = normalizeInactiveThemeNewsSnapshot({
      rawNewsCount: 100,
      activeDays: 90,
      lookbackDays: 90,
    })

    expect(result.normalizedCount).toBeCloseTo(100)
    expect(result.scaleFactor).toBeCloseTo(1)
  })

  it('clamps scale factor to [0, 1]', () => {
    const result = normalizeInactiveThemeNewsSnapshot({
      rawNewsCount: 50,
      activeDays: 120,
      lookbackDays: 90,
    })

    expect(result.scaleFactor).toBe(1)
    expect(result.normalizedCount).toBe(50)
  })

  it('handles zero active days', () => {
    const result = normalizeInactiveThemeNewsSnapshot({
      rawNewsCount: 50,
      activeDays: 0,
      lookbackDays: 90,
    })

    expect(result.normalizedCount).toBe(0)
    expect(result.scaleFactor).toBe(0)
  })
})

// ── CMPV4-017: VIF diagnostic ──

describe('CMPV4-017: VIF diagnostic and conditional feature merge', () => {
  it('computes VIF from correlation matrix', () => {
    // Low collinearity: features are independent
    const result = computeVIFDiagnostic({
      featureNames: ['interest', 'news', 'volatility'],
      correlationMatrix: [
        [1.0, 0.1, 0.2],
        [0.1, 1.0, 0.15],
        [0.2, 0.15, 1.0],
      ],
      mergeThreshold: 5.0,
    })

    expect(result.vifValues).toHaveLength(3)
    expect(result.featuresToMerge).toEqual([])
  })

  it('recommends merging highly collinear features', () => {
    // High collinearity between feature 0 and 1
    const result = computeVIFDiagnostic({
      featureNames: ['interest', 'interestMomentum', 'volatility'],
      correlationMatrix: [
        [1.0, 0.95, 0.1],
        [0.95, 1.0, 0.1],
        [0.1, 0.1, 1.0],
      ],
      mergeThreshold: 5.0,
    })

    expect(result.featuresToMerge.length).toBeGreaterThan(0)
  })
})

// ── CMPV4-017: N<15 Mutual Rank explicit fallback ──

describe('CMPV4-017: N<15 Mutual Rank explicit fallback', () => {
  it('defines minimum theme count constant', () => {
    expect(MUTUAL_RANK_MIN_THEMES).toBe(15)
  })

  it('returns explicit fallback result when N < 15', () => {
    const result = mutualRankExplicitFallback({
      themeCount: 10,
      themeIdA: 'a',
      themeIdB: 'b',
    })

    expect(result.applicable).toBe(false)
    expect(result.similarity).toBeNull()
    expect(result.fallbackReason).toBe('insufficient_population')
  })

  it('returns applicable when N >= 15', () => {
    const result = mutualRankExplicitFallback({
      themeCount: 20,
      themeIdA: 'a',
      themeIdB: 'b',
    })

    expect(result.applicable).toBe(true)
    expect(result.similarity).toBeNull() // caller must compute
    expect(result.fallbackReason).toBeNull()
  })

  it('returns explicit fallback at exactly N=14', () => {
    const result = mutualRankExplicitFallback({
      themeCount: 14,
      themeIdA: 'a',
      themeIdB: 'b',
    })

    expect(result.applicable).toBe(false)
    expect(result.fallbackReason).toBe('insufficient_population')
  })

  it('returns applicable at exactly N=15', () => {
    const result = mutualRankExplicitFallback({
      themeCount: 15,
      themeIdA: 'a',
      themeIdB: 'b',
    })

    expect(result.applicable).toBe(true)
  })
})
