/**
 * 유사도 계산 — 피어슨 상관계수, 코사인, Z-score 유클리디안, 키워드 자카드
 */

import { avg, standardDeviation } from '../normalize'

// ---------------------------------------------------------------------------
// 피어슨 상관계수 (임계값 완화: 0.005)
// ---------------------------------------------------------------------------

/**
 * 피어슨 상관계수 계산
 * - 최소 7개 데이터 포인트 필요
 * - 상수 타임라인(stddev < 0.005) 스킵
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 7) return 0

  const xSlice = x.slice(0, n)
  const ySlice = y.slice(0, n)

  const avgX = avg(xSlice)
  const avgY = avg(ySlice)

  // 상수 타임라인 스킵 (변동 없는 데이터는 상관분석 무의미)
  // 값이 0-1 정규화 범위이므로 임계값을 0.005로 완화
  const stdX = standardDeviation(xSlice)
  const stdY = standardDeviation(ySlice)
  if (stdX < 0.005 || stdY < 0.005) return 0

  let num = 0
  let denX = 0
  let denY = 0

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - avgX
    const dy = ySlice[i] - avgY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }

  const denominator = Math.sqrt(denX * denY)
  if (denominator === 0) return 0

  return num / denominator
}

// ---------------------------------------------------------------------------
// 코사인 유사도
// ---------------------------------------------------------------------------

/**
 * 코사인 유사도 (두 벡터 간 각도 기반 유사도)
 * 결과 범위: [-1, 1], 동일 방향일수록 1에 가까움
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0

  return dot / denom
}

// ---------------------------------------------------------------------------
// Z-score 유클리디안 유사도
// ---------------------------------------------------------------------------

/** Population statistics for feature dimensions */
export interface FeaturePopulationStats {
  means: number[]
  stddevs: number[]
}

/**
 * Z-score Euclidean similarity: z-score normalization으로 모집단 대비 상대적 위치 비교.
 * 코사인 유사도와 달리 비음수 벡터에서도 높은 판별력을 제공한다.
 * 반환: [0, 1] — 동일하면 1.0, 멀수록 0에 수렴
 */
export function zScoreEuclideanSimilarity(
  a: number[],
  b: number[],
  stats: FeaturePopulationStats,
): number {
  if (a.length !== b.length || a.length === 0) return 0
  const n = a.length
  let sumSqDiff = 0
  for (let i = 0; i < n; i++) {
    const std = stats.stddevs[i] > 0.001 ? stats.stddevs[i] : 1
    const zA = (a[i] - stats.means[i]) / std
    const zB = (b[i] - stats.means[i]) / std
    sumSqDiff += (zA - zB) ** 2
  }
  const distance = Math.sqrt(sumSqDiff / n)
  return Math.exp(-distance)
}

// ---------------------------------------------------------------------------
// 키워드 자카드 유사도
// ---------------------------------------------------------------------------

/** 두 키워드 집합의 Jaccard 유사도 (교집합 / 합집합) */
export function keywordJaccard(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0

  const a = new Set(setA.map(k => k.toLowerCase()))
  const b = new Set(setB.map(k => k.toLowerCase()))

  let intersection = 0
  a.forEach(k => {
    if (b.has(k)) intersection++
  })

  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}
