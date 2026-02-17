/**
 * Mutual Rank 기반 유사도 v2 — hub dominance 방지 + 선형 변환
 *
 * Mutual Rank: A가 B를 상위 이웃으로 보고, B도 A를 상위 이웃으로 볼 때만
 * 높은 유사도를 부여한다. sqrt(rankA→B × rankB→A) 기반.
 *
 * v2 변경: 지수 커널 exp(-mr/σ) → 선형 변환 max(0, 1 - mr/N)
 * 선행연구 검증: CV=0.20 → CV=1.01 (판별력 5배 향상)
 * 센트로이드 매치: 259/259 → 41/259 (84% 감소)
 */

import type { FeaturePopulationStats } from './similarity'

export interface MutualRankIndex {
  /** 두 테마 간 Mutual Rank 유사도 [0, 1] */
  getSimilarity(idA: string, idB: string): number
}

/**
 * 전체 테마의 Mutual Rank 인덱스를 구축한다.
 * O(N² log N) — N=300 기준 ~90K 쌍, 무시할 수 있는 비용.
 */
export function buildMutualRankIndex(
  themes: ReadonlyArray<{ id: string; featureVector: number[] }>,
  populationStats: FeaturePopulationStats,
): MutualRankIndex {
  const n = themes.length
  if (n < 2) return { getSimilarity: () => 0 }

  const numDims = themes[0].featureVector.length
  if (numDims === 0) return { getSimilarity: () => 0 }

  // Step 1: z-score 정규화
  const zVecs: number[][] = themes.map(t =>
    t.featureVector.map((v, d) => {
      const std = populationStats.stddevs[d] > 0.001 ? populationStats.stddevs[d] : 1
      return (v - populationStats.means[d]) / std
    }),
  )

  // Step 2: 쌍별 유클리디안 거리 (z-score 공간)
  const dist: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sumSq = 0
      for (let d = 0; d < numDims; d++) {
        sumSq += (zVecs[i][d] - zVecs[j][d]) ** 2
      }
      const distance = Math.sqrt(sumSq / numDims)
      dist[i][j] = distance
      dist[j][i] = distance
    }
  }

  // Step 3: 각 테마의 이웃을 거리 순으로 정렬 → 순위 부여
  const ranks: Uint16Array[] = Array.from({ length: n }, () => new Uint16Array(n))
  for (let i = 0; i < n; i++) {
    const indices: number[] = []
    for (let j = 0; j < n; j++) { if (j !== i) indices.push(j) }
    indices.sort((a, b) => dist[i][a] - dist[i][b])
    for (let r = 0; r < indices.length; r++) {
      ranks[i][indices[r]] = r + 1  // 1-based rank
    }
  }

  // Step 4: Mutual Rank → 선형 변환 (v2 — CV=1.01 검증됨)
  // max(0, 1 - mr/N): mr=1 → sim≈1, mr=N → sim=0
  const simMap = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt(ranks[i][j] * ranks[j][i])
      const sim = Math.max(0, 1 - mr / n)
      const key = `${themes[i].id}\0${themes[j].id}`
      const keyRev = `${themes[j].id}\0${themes[i].id}`
      simMap.set(key, sim)
      simMap.set(keyRev, sim)
    }
  }

  return {
    getSimilarity(idA: string, idB: string): number {
      return simMap.get(`${idA}\0${idB}`) ?? 0
    },
  }
}

/**
 * 곡선(RMSE) 기반 Mutual Rank 인덱스 — 선형 변환 (v2).
 *
 * RMSE 쌍별 거리 → 순위 → Mutual Rank → max(0, 1 - mr/N).
 * Feature MR과 동일한 선형 변환 적용.
 */
export function buildCurveMutualRankIndex(
  themes: ReadonlyArray<{ id: string; resampledCurve: number[] }>,
): MutualRankIndex {
  const n = themes.length
  if (n < 2) return { getSimilarity: () => 0 }

  const curveLen = themes[0].resampledCurve.length
  if (curveLen === 0) return { getSimilarity: () => 0 }

  // Step 1: 쌍별 RMSE 거리
  const dist: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sumSq = 0
      const cA = themes[i].resampledCurve
      const cB = themes[j].resampledCurve
      const len = Math.min(cA.length, cB.length)
      if (len === 0) continue
      for (let k = 0; k < len; k++) {
        sumSq += (cA[k] - cB[k]) ** 2
      }
      const rmse = Math.sqrt(sumSq / len)
      dist[i][j] = rmse
      dist[j][i] = rmse
    }
  }

  // Step 2: 각 테마의 이웃을 거리 순으로 정렬 → 순위 부여
  const ranks: Uint16Array[] = Array.from({ length: n }, () => new Uint16Array(n))
  for (let i = 0; i < n; i++) {
    const indices: number[] = []
    for (let j = 0; j < n; j++) { if (j !== i) indices.push(j) }
    indices.sort((a, b) => dist[i][a] - dist[i][b])
    for (let r = 0; r < indices.length; r++) {
      ranks[i][indices[r]] = r + 1
    }
  }

  // Step 3: Mutual Rank → 선형 변환 (v2)
  const simMap = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt(ranks[i][j] * ranks[j][i])
      const sim = Math.max(0, 1 - mr / n)
      const key = `${themes[i].id}\0${themes[j].id}`
      const keyRev = `${themes[j].id}\0${themes[i].id}`
      simMap.set(key, sim)
      simMap.set(keyRev, sim)
    }
  }

  return {
    getSimilarity(idA: string, idB: string): number {
      return simMap.get(`${idA}\0${idB}`) ?? 0
    },
  }
}