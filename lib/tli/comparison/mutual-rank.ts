/**
 * Mutual Rank 기반 유사도 — hub dominance 방지
 *
 * Mutual Rank: A가 B를 상위 이웃으로 보고, B도 A를 상위 이웃으로 볼 때만
 * 높은 유사도를 부여한다. sqrt(rankA→B × rankB→A) 기반.
 *
 * Feature MR: z-score 유클리디안 거리 + 지수 감쇠 커널 exp(-mr/σ)
 * Curve MR: RMSE 거리 + 지수 감쇠 커널 exp(-mr/σ) (Zelnik-Manor & Perona 2004)
 *
 * σ = max(N/4, 5): 상위 ~25% 이웃만 유의미한 유사도(>0.37)를 유지.
 * hub 테마는 대부분의 상대와 높은 mutual rank → 지수 감쇠로 억제.
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

  // Step 4: Mutual Rank → 지수 감쇠 커널 변환
  // 선형 정규화는 N=260에서 변별력 부족 (rank 13 → sim 0.95)
  // 지수 커널 exp(-mr/σ)로 상위 이웃만 높은 유사도 부여
  const sigma = Math.max(n / 4, 5)

  // 사전 계산된 유사도 Map (양방향 키)
  const simMap = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt(ranks[i][j] * ranks[j][i])
      const sim = Math.exp(-mr / sigma)
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
 * 곡선(RMSE) 기반 Mutual Rank 인덱스 — 지수 감쇠 커널.
 *
 * RMSE 쌍별 거리 → 순위 → Mutual Rank → exp(-mr/σ).
 * σ = max(N/4, 5): Feature MR과 동일한 감쇠 파라미터.
 * Curve N은 현재 소규모(~10)이므로 σ=5로 동작,
 * 데이터 축적에 따라 자동 조정.
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

  // Step 3: Mutual Rank → 지수 감쇠 커널 변환
  const sigma = Math.max(n / 4, 5)

  const simMap = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt(ranks[i][j] * ranks[j][i])
      // exp(-mr/σ): mr=1 → ~0.72 (σ=3), mr이 커질수록 급격히 감쇠
      const sim = Math.exp(-mr / sigma)
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