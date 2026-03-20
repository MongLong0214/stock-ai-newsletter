/**
 * TCAR-011: Episode-Aware Retrieval Evaluation
 *
 * Computes retrieval metrics for replay_holdout evaluation:
 * - FuturePathCorr@K: mean future path correlation of top-K candidates
 * - PeakHit@K: fraction of queries where a top-K candidate peak is within tolerance
 * - PeakGap@K: median minimum peak gap across top-K candidates
 * - Block bootstrap lower bound for weekly cohort-aware CI
 *
 * All functions are pure. No DB calls.
 */

import type { Stage } from '@/lib/tli/types/db'

// --- Types ---

export interface EvalCandidate {
  candidateEpisodeId: string
  rank: number
  peakDay: number
  totalDays: number
  futurePathCorrelation: number
}

export interface EvalRow {
  queryEpisodeId: string
  queryThemeId: string
  queryStage: Stage
  queryPeakDay: number
  queryTotalDays: number
  queryWeekCohort: string
  candidates: EvalCandidate[]
}

export interface MetricReportOptions {
  k: number
  peakHitToleranceDays: number
  minimumN?: number
}

export interface MetricReport {
  futurePathCorrAtK: number
  peakHitAtK: number
  medianPeakGapAtK: number | null
  evalRowCount: number
  insufficientData: boolean
}

export interface SliceMetricReport extends MetricReport {
  sliceName: string
}

// --- Core Metrics ---

export const computeFuturePathCorrAtK = (row: EvalRow, k: number): number => {
  const topK = row.candidates.slice(0, k)
  if (topK.length === 0) return 0

  const sum = topK.reduce((acc, c) => acc + c.futurePathCorrelation, 0)
  return sum / topK.length
}

export const computePeakHitAtK = (
  row: EvalRow,
  k: number,
  options: { toleranceDays: number },
): number => {
  const topK = row.candidates.slice(0, k)
  if (topK.length === 0) return 0

  const hit = topK.some(c =>
    Math.abs(row.queryPeakDay - c.peakDay) <= options.toleranceDays,
  )
  return hit ? 1 : 0
}

export const computePeakGapAtK = (row: EvalRow, k: number): number | null => {
  const topK = row.candidates.slice(0, k)
  if (topK.length === 0) return null

  const gaps = topK.map(c => Math.abs(row.queryPeakDay - c.peakDay))
  return Math.min(...gaps)
}

// --- Aggregate Report ---

export const computeRetrievalMetricReport = (
  rows: EvalRow[],
  options: MetricReportOptions,
): MetricReport => {
  const n = rows.length
  const minN = options.minimumN ?? 0

  if (n === 0) {
    return {
      futurePathCorrAtK: 0,
      peakHitAtK: 0,
      medianPeakGapAtK: null,
      evalRowCount: 0,
      insufficientData: true,
    }
  }

  const corrs = rows.map(r => computeFuturePathCorrAtK(r, options.k))
  const hits = rows.map(r => computePeakHitAtK(r, options.k, { toleranceDays: options.peakHitToleranceDays }))
  const gaps = rows.map(r => computePeakGapAtK(r, options.k)).filter((g): g is number => g !== null)

  const meanCorr = corrs.reduce((a, b) => a + b, 0) / n
  const meanHit = hits.reduce((a, b) => a + b, 0) / n

  // Median gap (proper median for even-N arrays)
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const medianGap = sortedGaps.length > 0
    ? sortedGaps.length % 2 === 1
      ? sortedGaps[Math.floor(sortedGaps.length / 2)]
      : (sortedGaps[sortedGaps.length / 2 - 1] + sortedGaps[sortedGaps.length / 2]) / 2
    : null

  return {
    futurePathCorrAtK: Math.round(meanCorr * 1000) / 1000,
    peakHitAtK: Math.round(meanHit * 1000) / 1000,
    medianPeakGapAtK: medianGap,
    evalRowCount: n,
    insufficientData: n < minN,
  }
}

// --- Block Bootstrap Lower Bound ---

export const blockBootstrapLowerBound = (
  values: number[],
  blockLabels: string[],
  options: { iterations: number; confidenceLevel: number },
): number => {
  if (values.length === 0) return 0

  // Group by block
  const blocks = new Map<string, number[]>()
  for (let i = 0; i < values.length; i++) {
    const label = blockLabels[i]
    const list = blocks.get(label) ?? []
    list.push(values[i])
    blocks.set(label, list)
  }

  const blockKeys = [...blocks.keys()]
  const nBlocks = blockKeys.length
  if (nBlocks === 0) return 0

  // Seeded pseudo-random for determinism within a call
  let seed = 42
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  // Bootstrap: resample blocks, compute mean
  const bootstrapMeans: number[] = []
  for (let iter = 0; iter < options.iterations; iter++) {
    const resampledValues: number[] = []
    for (let b = 0; b < nBlocks; b++) {
      const blockIdx = Math.floor(random() * nBlocks)
      const blockKey = blockKeys[blockIdx]
      resampledValues.push(...blocks.get(blockKey)!)
    }

    if (resampledValues.length === 0) continue
    const mean = resampledValues.reduce((a, b) => a + b, 0) / resampledValues.length
    bootstrapMeans.push(mean)
  }

  if (bootstrapMeans.length === 0) return 0

  // Sort and find lower bound at (1 - confidence) percentile
  bootstrapMeans.sort((a, b) => a - b)
  const lowerIdx = Math.floor((1 - options.confidenceLevel) * bootstrapMeans.length)
  return bootstrapMeans[Math.max(0, lowerIdx)]
}

// --- Slice-wise Evaluation ---

export const computeSliceWiseMetrics = (
  rows: EvalRow[],
  options: MetricReportOptions & { sliceBy: (row: EvalRow) => string },
): SliceMetricReport[] => {
  const sliceGroups = new Map<string, EvalRow[]>()
  for (const row of rows) {
    const sliceName = options.sliceBy(row)
    const group = sliceGroups.get(sliceName) ?? []
    group.push(row)
    sliceGroups.set(sliceName, group)
  }

  return [...sliceGroups.entries()].map(([sliceName, sliceRows]) => ({
    sliceName,
    ...computeRetrievalMetricReport(sliceRows, options),
  }))
}
