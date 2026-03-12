import { describe, it, expect } from 'vitest'
import { compositeCompare } from '../comparison/composite'
import type { ThemeFeatures } from '../comparison/features'
import type { TimeSeriesPoint } from '../comparison/timeline'

function makeFeatures(overrides?: Partial<ThemeFeatures>): ThemeFeatures {
  return {
    interestLevel: 0.5,
    interestMomentum: 0.5,
    volatilityDVI: 0.3,
    newsIntensity: 0.4,
    activeDaysNorm: 0.2,
    lifecyclePosition: 0.5,
    recoverySignal: 0.2,
    sectorConfidence: 0.8,
    keywordSpecificity: 0.5,
    priceChangePct: 0.5,
    volumeIntensity: 0,
    ...overrides,
  }
}

function makeCurve(length: number, valueFn: (i: number) => number = i => i * 10): TimeSeriesPoint[] {
  return Array.from({ length }, (_, i) => ({ day: i, value: valueFn(i) }))
}

describe('compositeCompare', () => {
  it('returns similarity between 0 and 1', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(20), keywords: ['AI'], activeDays: 10, sector: 'AI' },
      past: { features: makeFeatures(), curve: makeCurve(20), keywords: ['AI'], peakDay: 15, totalDays: 30, name: 'test', sector: 'AI' },
    })
    expect(result.similarity).toBeGreaterThanOrEqual(0)
    expect(result.similarity).toBeLessThanOrEqual(1)
  })

  it('returns high similarity for identical themes', () => {
    const features = makeFeatures()
    const curve = makeCurve(20)
    const keywords = ['AI', 'GPU']
    const result = compositeCompare({
      current: { features, curve, keywords, activeDays: 10, sector: 'AI' },
      past: { features, curve, keywords, peakDay: 15, totalDays: 30, name: 'test', sector: 'AI' },
      precomputedFeatureSim: 1.0,
    })
    // 선형 곡선은 미분 상관=0 → curveSim≈0.6 → 전체 0.76 (정상)
    expect(result.similarity).toBeGreaterThan(0.7)
  })

  it('applies sector penalty (0.85) for different sectors', () => {
    const features = makeFeatures()
    const curve = makeCurve(20)
    const keywords = ['AI']

    const sameSector = compositeCompare({
      current: { features, curve, keywords, activeDays: 10, sector: 'AI', sectorConfidence: 0.9 },
      past: { features, curve, keywords, peakDay: 15, totalDays: 30, name: 'test', sector: 'AI', sectorConfidence: 0.9 },
    })
    const diffSector = compositeCompare({
      current: { features, curve, keywords, activeDays: 10, sector: 'AI', sectorConfidence: 0.9 },
      past: { features, curve, keywords, peakDay: 15, totalDays: 30, name: 'test', sector: '반도체', sectorConfidence: 0.9 },
    })
    expect(diffSector.similarity).toBeCloseTo(sameSector.similarity * 0.85, 2)
  })

  it('skips sector penalty when either is "etc"', () => {
    const features = makeFeatures()
    const curve = makeCurve(20)
    const result = compositeCompare({
      current: { features, curve, keywords: [], activeDays: 10, sector: 'etc', sectorConfidence: 0.2 },
      past: { features, curve, keywords: [], peakDay: 15, totalDays: 30, name: 'test', sector: '반도체', sectorConfidence: 0.9 },
    })
    // low-confidence sector는 soft penalty만 적용
    const sameResult = compositeCompare({
      current: { features, curve, keywords: [], activeDays: 10, sector: '반도체', sectorConfidence: 0.9 },
      past: { features, curve, keywords: [], peakDay: 15, totalDays: 30, name: 'test', sector: '반도체', sectorConfidence: 0.9 },
    })
    expect(result.similarity).toBeLessThan(sameResult.similarity)
    expect(result.similarity).toBeCloseTo(sameResult.similarity * 0.95, 2)
  })

  describe('adaptive weights', () => {
    it('uses curve=0.60 weight for 14+ curve points', () => {
      const result = compositeCompare({
        current: { features: makeFeatures(), curve: makeCurve(20), keywords: ['a'], activeDays: 10, sector: 'AI' },
        past: { features: makeFeatures(), curve: makeCurve(20), keywords: ['a'], peakDay: 15, totalDays: 30, name: 'test', sector: 'AI' },
      })
      // curveSim이 유의미하게 기여해야 함
      expect(result.curveSim).toBeGreaterThan(0)
    })

    it('uses curve=0 weight for <7 curve points', () => {
      const result = compositeCompare({
        current: { features: makeFeatures(), curve: makeCurve(3), keywords: ['a'], activeDays: 10, sector: 'AI' },
        past: { features: makeFeatures(), curve: makeCurve(3), keywords: ['a'], peakDay: 15, totalDays: 30, name: 'test', sector: 'AI' },
      })
      // minCurveLen < 7이면 curveSim = 0
      expect(result.curveSim).toBe(0)
    })
  })

  it('redistributes keyword dead weight when keywordSim=0', () => {
    const features = makeFeatures()
    const curve = makeCurve(20)

    const withKeywords = compositeCompare({
      current: { features, curve, keywords: ['x'], activeDays: 10, sector: 'AI' },
      past: { features, curve, keywords: ['y'], peakDay: 15, totalDays: 30, name: 'test', sector: 'AI' },
    })
    expect(withKeywords.keywordSim).toBe(0)
    // feature+curve 재분배로 결과가 0이 아니어야 함
    expect(withKeywords.similarity).toBeGreaterThan(0)
  })

  it('rounds similarity to 3 decimal places', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(10), keywords: ['a'], activeDays: 5, sector: 'AI' },
      past: { features: makeFeatures({ interestMomentum: 0.8 }), curve: makeCurve(10, i => i * 5), keywords: ['a', 'b'], peakDay: 7, totalDays: 20, name: 'test', sector: 'AI' },
    })
    const decimalPlaces = result.similarity.toString().split('.')[1]?.length ?? 0
    expect(decimalPlaces).toBeLessThanOrEqual(3)
  })

  it('clamps similarity to [0, 1]', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: [], keywords: [], activeDays: 0, sector: 'etc' },
      past: { features: makeFeatures(), curve: [], keywords: [], peakDay: 0, totalDays: 0, name: 'test', sector: 'etc' },
    })
    expect(result.similarity).toBeGreaterThanOrEqual(0)
    expect(result.similarity).toBeLessThanOrEqual(1)
  })

  it('calculates estimatedDaysToPeak correctly', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(5), keywords: [], activeDays: 10, sector: 'etc' },
      past: { features: makeFeatures(), curve: makeCurve(5), keywords: [], peakDay: 25, totalDays: 50, name: 'test', sector: 'etc' },
    })
    expect(result.currentDay).toBe(10)
    expect(result.pastPeakDay).toBe(25)
    expect(result.estimatedDaysToPeak).toBe(15) // 25 - 10
  })

  it('clamps estimatedDaysToPeak to 0 when past peak', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(5), keywords: [], activeDays: 30, sector: 'etc' },
      past: { features: makeFeatures(), curve: makeCurve(5), keywords: [], peakDay: 10, totalDays: 50, name: 'test', sector: 'etc' },
    })
    expect(result.estimatedDaysToPeak).toBe(0)
  })

  it('caps pastTotalDays at 365', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(5), keywords: [], activeDays: 5, sector: 'etc' },
      past: { features: makeFeatures(), curve: makeCurve(5), keywords: [], peakDay: 10, totalDays: 500, name: 'test', sector: 'etc' },
    })
    expect(result.pastTotalDays).toBe(365)
  })

  it('uses populationStats for feature similarity when provided', () => {
    const stats = {
      means: [0.5, 0.3, 0.4, 0.6, 0.2, 0.5, 0.2, 0.8, 0.5, 0.5, 0],
      stddevs: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
    }
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(3), keywords: [], activeDays: 5, sector: 'etc' },
      past: { features: makeFeatures(), curve: makeCurve(3), keywords: [], peakDay: 10, totalDays: 30, name: 'test', sector: 'etc' },
      populationStats: stats,
    })
    // 동일 피처 + 일치하는 통계 → featureSim ≈ 1.0
    expect(result.featureSim).toBeCloseTo(1, 3)
  })

  it('includes a message string', () => {
    const result = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(5), keywords: ['AI'], activeDays: 5, sector: 'AI' },
      past: { features: makeFeatures(), curve: makeCurve(5), keywords: ['AI'], peakDay: 10, totalDays: 30, name: 'past-test', sector: 'AI' },
    })
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('applies artifact-backed custom weights when provided', () => {
    const current = {
      features: makeFeatures({ interestMomentum: 0.9 }),
      curve: makeCurve(20, (index) => index * 2),
      keywords: ['AI'],
      activeDays: 10,
      sector: 'AI',
    }
    const past = {
      features: makeFeatures({ interestMomentum: 0.9 }),
      curve: makeCurve(20, (index) => index * 8),
      keywords: ['AI'],
      peakDay: 15,
      totalDays: 30,
      name: 'weighted-test',
      sector: 'AI',
    }

    const featureHeavy = compositeCompare({
      current,
      past,
      weightConfig: {
        wFeature: 1,
        wCurve: 0,
        wKeyword: 0,
        sectorPenalty: 0.85,
      },
    })
    const curveHeavy = compositeCompare({
      current,
      past,
      weightConfig: {
        wFeature: 0,
        wCurve: 1,
        wKeyword: 0,
        sectorPenalty: 0.85,
      },
    })

    expect(featureHeavy.similarity).toBeGreaterThan(curveHeavy.similarity)
  })

  it('boosts rare keyword overlap above generic overlap when support counts are available', () => {
    const generic = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(20), keywords: ['테마', '관련주'], keywordsLower: new Set(['테마', '관련주']), activeDays: 10, sector: 'AI', sectorConfidence: 0.9 },
      past: { features: makeFeatures(), curve: makeCurve(20), keywords: ['테마'], keywordsLower: new Set(['테마']), peakDay: 15, totalDays: 30, name: 'generic', sector: 'AI', sectorConfidence: 0.9 },
      keywordSupportCounts: new Map([['테마', 100], ['hbm', 2]]),
    })

    const rare = compositeCompare({
      current: { features: makeFeatures(), curve: makeCurve(20), keywords: ['HBM'], keywordsLower: new Set(['hbm']), activeDays: 10, sector: 'AI', sectorConfidence: 0.9 },
      past: { features: makeFeatures(), curve: makeCurve(20), keywords: ['HBM'], keywordsLower: new Set(['hbm']), peakDay: 15, totalDays: 30, name: 'rare', sector: 'AI', sectorConfidence: 0.9 },
      keywordSupportCounts: new Map([['테마', 100], ['hbm', 2]]),
    })

    expect(rare.keywordSim).toBeGreaterThan(generic.keywordSim)
  })
})
