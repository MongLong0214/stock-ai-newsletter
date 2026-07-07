import { clusterBootstrapPairedDelta } from '@/lib/tli/stats/comparison-stats'
import { computeQuantileEce, evaluatePredictionRows, getFiniteProbability, toBrierError } from './metrics'
import type { BrierDeltaCi, ClusterImbalanceReport, EvalPredictionRow, PredictionMetrics } from './types'

interface BrierPair {
  readonly id: string
  readonly clusterId: string
  readonly baseline: number
  readonly candidate: number
}

const DEFAULT_BOOTSTRAP_ITERATIONS = 2000
const DEFAULT_CONFIDENCE_LEVEL = 0.95

const mean = (values: readonly number[]): number | null => (
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
)

export function detectClusterImbalance(
  rows: readonly { readonly clusterId: string }[],
  threshold = 0.3,
): ClusterImbalanceReport {
  const countsByCluster = new Map<string, number>()
  for (const row of rows) countsByCluster.set(row.clusterId, (countsByCluster.get(row.clusterId) ?? 0) + 1)
  const counts = [...countsByCluster.values()]
  const topClusterCount = counts.length === 0 ? 0 : Math.max(1, Math.ceil(counts.length * 0.05))
  const topShare = rows.length === 0 ? 0 : counts.sort((left, right) => right - left)
    .slice(0, topClusterCount)
    .reduce((sum, count) => sum + count, 0) / rows.length
  return {
    clusterCount: counts.length,
    observationCount: rows.length,
    topClusterCount,
    topClusterShare: topShare,
    useWildClusterBootstrap: topShare > threshold,
  }
}

const nextRandomFactory = (seedInput: number) => {
  let seed = seedInput
  return () => {
    seed = (seed * 1664525 + 1013904223) | 0
    return (seed >>> 0) / 0x100000000
  }
}

const wildClusterBootstrap = (
  rows: readonly BrierPair[],
  options: { readonly iterations: number; readonly confidenceLevel: number; readonly seed: number },
) => {
  const deltas = rows.map((row) => row.candidate - row.baseline)
  const observed = mean(deltas) ?? Number.NaN
  const centered = rows.map((row, index) => ({ clusterId: row.clusterId, value: deltas[index] - observed }))
  const clusters = [...new Set(rows.map((row) => row.clusterId))]
  const nextRandom = nextRandomFactory(options.seed)
  const means: number[] = []
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const signs = new Map(clusters.map((cluster) => [cluster, nextRandom() < 0.5 ? -1 : 1]))
    means.push(observed + centered.reduce((sum, row) => sum + row.value * (signs.get(row.clusterId) ?? 1), 0) / rows.length)
  }
  means.sort((left, right) => left - right)
  const alpha = 1 - options.confidenceLevel
  return {
    meanDelta: observed,
    lower: means[Math.max(0, Math.floor(alpha * options.iterations))] ?? observed,
    upper: means[Math.min(options.iterations - 1, Math.floor((1 - alpha) * options.iterations))] ?? observed,
  }
}

export function computeBrierDeltaCi(
  input: {
    readonly baseline: readonly EvalPredictionRow[]
    readonly candidate: readonly EvalPredictionRow[]
    readonly iterations?: number
    readonly confidenceLevel?: number
    readonly seed?: number
  },
): BrierDeltaCi {
  const baselineById = new Map(input.baseline.map((row) => [row.id, row]))
  const pairs = input.candidate.flatMap((candidateRow): BrierPair[] => {
    const baselineRow = baselineById.get(candidateRow.id)
    const baselineProbability = baselineRow ? getFiniteProbability(baselineRow) : null
    const candidateProbability = getFiniteProbability(candidateRow)
    if (!baselineRow || baselineProbability === null || candidateProbability === null) return []
    return [{
      id: candidateRow.id,
      clusterId: candidateRow.themeId,
      baseline: toBrierError(baselineProbability, candidateRow.y),
      candidate: toBrierError(candidateProbability, candidateRow.y),
    }]
  })
  const iterations = input.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS
  const confidenceLevel = input.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL
  const imbalance = detectClusterImbalance(pairs)
  const result = imbalance.useWildClusterBootstrap
    ? wildClusterBootstrap(pairs, { iterations, confidenceLevel, seed: input.seed ?? 42 })
    : clusterBootstrapPairedDelta(pairs, { iterations, confidenceLevel, seed: input.seed })
  return {
    metric: 'brier',
    method: imbalance.useWildClusterBootstrap ? 'wild_cluster_bootstrap' : 'cluster_bootstrap',
    meanDelta: result.meanDelta,
    lower: result.lower,
    upper: result.upper,
    clusterCount: imbalance.clusterCount,
    observationCount: pairs.length,
    iterations,
    confidenceLevel,
    imbalance,
  }
}

/**
 * N4: theme(cluster)-level resampling to estimate the upper95 of ECE's absolute-value
 * distribution. Unlike computeBrierDeltaCi's paired-delta bootstrap, ECE is a single (non-paired)
 * metric, so this resamples clusters with replacement and recomputes ECE per iteration —
 * reusing the same seeded RNG + B=2000 default as the Brier cluster bootstrap.
 */
export function computeEceClusterBootstrapUpper95(
  rows: readonly EvalPredictionRow[],
  options: {
    readonly iterations?: number
    readonly confidenceLevel?: number
    readonly seed?: number
    readonly binCount?: number
    readonly minBinSize?: number
  } = {},
): number {
  const clusters = [...new Set(rows.map((row) => row.themeId))]
  if (clusters.length === 0) return 1

  const byCluster = new Map<string, EvalPredictionRow[]>()
  for (const row of rows) byCluster.set(row.themeId, [...(byCluster.get(row.themeId) ?? []), row])

  const iterations = options.iterations ?? DEFAULT_BOOTSTRAP_ITERATIONS
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL
  const nextRandom = nextRandomFactory(options.seed ?? 42)

  const samples: number[] = []
  for (let iteration = 0; iteration < iterations; iteration++) {
    const resampled: EvalPredictionRow[] = []
    for (let index = 0; index < clusters.length; index++) {
      const picked = clusters[Math.floor(nextRandom() * clusters.length)]
      resampled.push(...(byCluster.get(picked) ?? []))
    }
    const { ece } = computeQuantileEce(resampled, { binCount: options.binCount, minBinSize: options.minBinSize })
    // Fail-closed (N2 contract): an unresolved/non-finite bootstrap sample reads as worst-case.
    samples.push(ece === null || !Number.isFinite(ece) ? 1 : ece)
  }
  samples.sort((left, right) => left - right)
  const upperIndex = Math.min(iterations - 1, Math.floor(confidenceLevel * iterations))
  return samples[upperIndex] ?? 1
}

/**
 * evaluatePredictionRows plus the N4 ECE cluster-bootstrap upper95, wired into the
 * PredictionMetrics.eceUpper95 field consumed by the promotion-gate input schema.
 */
export function evaluatePredictionRowsWithEceUpper95(
  rows: readonly EvalPredictionRow[],
  options: {
    readonly eceMinBinSize?: number
    readonly pAtK?: number
    readonly bootstrapIterations?: number
    readonly bootstrapConfidenceLevel?: number
    readonly bootstrapSeed?: number
  } = {},
): PredictionMetrics {
  const metrics = evaluatePredictionRows(rows, options)
  return {
    ...metrics,
    eceUpper95: computeEceClusterBootstrapUpper95(rows, {
      iterations: options.bootstrapIterations,
      confidenceLevel: options.bootstrapConfidenceLevel,
      seed: options.bootstrapSeed,
      minBinSize: options.eceMinBinSize,
    }),
  }
}
