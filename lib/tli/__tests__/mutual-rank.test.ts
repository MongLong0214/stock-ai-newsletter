import { describe, it, expect } from 'vitest'
import { buildMutualRankIndex, buildCurveMutualRankIndex } from '../comparison/mutual-rank'
import type { FeaturePopulationStats } from '../comparison/similarity'

function makeStats(numDims: number): FeaturePopulationStats {
  return { means: Array(numDims).fill(0), stddevs: Array(numDims).fill(1) }
}

describe('buildMutualRankIndex', () => {
  it('returns 0 for fewer than 2 themes', () => {
    const idx = buildMutualRankIndex(
      [{ id: 'a', featureVector: [1, 2, 3] }],
      makeStats(3),
    )
    expect(idx.getSimilarity('a', 'a')).toBe(0)
  })

  it('returns 0 for empty feature vectors', () => {
    const idx = buildMutualRankIndex(
      [{ id: 'a', featureVector: [] }, { id: 'b', featureVector: [] }],
      makeStats(0),
    )
    expect(idx.getSimilarity('a', 'b')).toBe(0)
  })

  it('is symmetric: getSimilarity(a,b) === getSimilarity(b,a)', () => {
    const themes = [
      { id: 'a', featureVector: [1, 0, 0] },
      { id: 'b', featureVector: [0, 1, 0] },
      { id: 'c', featureVector: [0, 0, 1] },
    ]
    const idx = buildMutualRankIndex(themes, makeStats(3))
    expect(idx.getSimilarity('a', 'b')).toBe(idx.getSimilarity('b', 'a'))
    expect(idx.getSimilarity('a', 'c')).toBe(idx.getSimilarity('c', 'a'))
    expect(idx.getSimilarity('b', 'c')).toBe(idx.getSimilarity('c', 'b'))
  })

  it('returns 0 for unknown theme pairs', () => {
    const themes = [
      { id: 'a', featureVector: [1, 0] },
      { id: 'b', featureVector: [0, 1] },
    ]
    const idx = buildMutualRankIndex(themes, makeStats(2))
    expect(idx.getSimilarity('a', 'unknown')).toBe(0)
    expect(idx.getSimilarity('unknown', 'a')).toBe(0)
  })

  it('similarity is in (0, 1] range', () => {
    const themes = [
      { id: 'a', featureVector: [1, 2, 3] },
      { id: 'b', featureVector: [1, 2, 3.1] },
      { id: 'c', featureVector: [10, 20, 30] },
    ]
    const idx = buildMutualRankIndex(themes, makeStats(3))
    const sim = idx.getSimilarity('a', 'b')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThanOrEqual(1)
  })

  it('nearest mutual neighbors have highest similarity', () => {
    // a와 b는 가까움, c는 멀리 떨어짐
    const themes = [
      { id: 'a', featureVector: [1, 1] },
      { id: 'b', featureVector: [1.1, 1.1] },
      { id: 'c', featureVector: [100, 100] },
    ]
    const idx = buildMutualRankIndex(themes, makeStats(2))
    expect(idx.getSimilarity('a', 'b')).toBeGreaterThan(idx.getSimilarity('a', 'c'))
  })

  it('suppresses hub dominance — prototypical theme gets lower similarity with distant themes', () => {
    // hub: 원점 근처 (모든 테마의 "평균"에 가까움)
    // a, b: 서로 가깝지만 hub과는 중간 거리
    // c: 멀리 떨어짐
    const themes = [
      { id: 'hub', featureVector: [0, 0] },
      { id: 'a', featureVector: [5, 5] },
      { id: 'b', featureVector: [5.1, 5.1] },
      { id: 'c', featureVector: [-5, -5] },
      { id: 'd', featureVector: [10, 0] },
      { id: 'e', featureVector: [0, 10] },
    ]
    const idx = buildMutualRankIndex(themes, makeStats(2))

    // a↔b는 진짜 이웃 — 높은 유사도
    const abSim = idx.getSimilarity('a', 'b')
    // hub↔a는 hub의 rank에서 a가 상위가 아닐 수 있음
    const hubASim = idx.getSimilarity('hub', 'a')
    // a↔b 유사도가 hub↔a보다 높아야 hub 억제 효과 확인
    expect(abSim).toBeGreaterThan(hubASim)
  })

  it('exponential kernel: similarity decays with mutual rank', () => {
    // 5개 테마를 1차원 직선 위에 배치
    const themes = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      featureVector: [i * 10],
    }))
    const idx = buildMutualRankIndex(themes, makeStats(1))

    // t0↔t1 (MR ~1) > t0↔t2 (MR ~2) > t0↔t4 (MR ~4)
    const sim01 = idx.getSimilarity('t0', 't1')
    const sim02 = idx.getSimilarity('t0', 't2')
    const sim04 = idx.getSimilarity('t0', 't4')
    expect(sim01).toBeGreaterThan(sim02)
    expect(sim02).toBeGreaterThan(sim04)
  })
})

describe('buildCurveMutualRankIndex', () => {
  it('returns 0 for fewer than 2 themes', () => {
    const idx = buildCurveMutualRankIndex([{ id: 'a', resampledCurve: [1, 2, 3] }])
    expect(idx.getSimilarity('a', 'a')).toBe(0)
  })

  it('returns 0 for empty curves', () => {
    const idx = buildCurveMutualRankIndex([
      { id: 'a', resampledCurve: [] },
      { id: 'b', resampledCurve: [] },
    ])
    expect(idx.getSimilarity('a', 'b')).toBe(0)
  })

  it('is symmetric', () => {
    const themes = [
      { id: 'a', resampledCurve: [0, 1, 2, 3, 4] },
      { id: 'b', resampledCurve: [0, 1, 2, 3, 5] },
      { id: 'c', resampledCurve: [10, 9, 8, 7, 6] },
    ]
    const idx = buildCurveMutualRankIndex(themes)
    expect(idx.getSimilarity('a', 'b')).toBe(idx.getSimilarity('b', 'a'))
    expect(idx.getSimilarity('a', 'c')).toBe(idx.getSimilarity('c', 'a'))
  })

  it('similar curves have higher similarity than dissimilar ones', () => {
    const themes = [
      { id: 'a', resampledCurve: [0, 10, 20, 30, 40, 50] },
      { id: 'b', resampledCurve: [0, 11, 21, 31, 41, 51] },
      { id: 'c', resampledCurve: [50, 40, 30, 20, 10, 0] },
    ]
    const idx = buildCurveMutualRankIndex(themes)
    expect(idx.getSimilarity('a', 'b')).toBeGreaterThan(idx.getSimilarity('a', 'c'))
  })

  it('handles variable curve lengths (uses shorter)', () => {
    const themes = [
      { id: 'a', resampledCurve: [1, 2, 3] },
      { id: 'b', resampledCurve: [1, 2, 3, 4, 5] },
    ]
    const idx = buildCurveMutualRankIndex(themes)
    const sim = idx.getSimilarity('a', 'b')
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThanOrEqual(1)
  })
})