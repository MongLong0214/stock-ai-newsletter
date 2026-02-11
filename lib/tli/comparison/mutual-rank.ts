/**
 * Mutual Rank 기반 특성 유사도 — centroid dominance 방지
 *
 * 기존 z-score 유클리디안은 모집단 중심에 가까운 테마(메타버스 등)가
 * 모든 테마와 높은 유사도를 보이는 centroid dominance 문제가 있다.
 *
 * Mutual Rank: A가 B를 상위 매칭으로 보고, B도 A를 상위 매칭으로 볼 때만
 * 높은 유사도를 부여한다. sqrt(rankA→B × rankB→A) 기반.
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

  // Step 4: Mutual Rank → 유사도 변환 (N=2일 때 maxRank=1, 유일한 쌍이므로 1.0)
  const maxRank = n - 1

  // 사전 계산된 유사도 Map (양방향 키)
  const simMap = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const mr = Math.sqrt(ranks[i][j] * ranks[j][i])
      // mr=1 → 1.0, mr=maxRank → 0.0 (선형 정규화)
      const sim = maxRank <= 1 ? 1.0 : Math.max(0, 1 - (mr - 1) / (maxRank - 1))
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