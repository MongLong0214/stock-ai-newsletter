/**
 * TCAR-011: Extend Replay Harness for Episode-Aware Retrieval Evaluation
 *
 * TDD RED phase — tests for retrieval metrics (FuturePathCorr@K, PeakHit@K, PeakGap@K).
 */

import { describe, expect, it } from 'vitest'
import {
  computeFuturePathCorrAtK,
  computePeakHitAtK,
  computePeakGapAtK,
  computeRetrievalMetricReport,
  computeSliceWiseMetrics,
  blockBootstrapLowerBound,
  type EvalRow,
  type SliceMetricReport,
} from '../research/evaluate-analog-retrieval'

// --- Test helpers ---

const makeEvalRow = (overrides: Partial<EvalRow> = {}): EvalRow => ({
  queryEpisodeId: 'ep-query',
  queryThemeId: 'th-query',
  queryStage: 'Growth',
  queryPeakDay: 20,
  queryTotalDays: 45,
  queryWeekCohort: '2026-W05',
  candidates: [
    {
      candidateEpisodeId: 'ep-cand-1',
      rank: 1,
      peakDay: 18,
      totalDays: 42,
      futurePathCorrelation: 0.85,
    },
    {
      candidateEpisodeId: 'ep-cand-2',
      rank: 2,
      peakDay: 25,
      totalDays: 50,
      futurePathCorrelation: 0.60,
    },
    {
      candidateEpisodeId: 'ep-cand-3',
      rank: 3,
      peakDay: 30,
      totalDays: 60,
      futurePathCorrelation: 0.40,
    },
  ],
  ...overrides,
})

describe('TCAR-011: computeFuturePathCorrAtK', () => {
  it('returns mean future path correlation of top-K candidates', () => {
    const row = makeEvalRow()
    const result = computeFuturePathCorrAtK(row, 2)

    // Top 2: 0.85 and 0.60 → mean = 0.725
    expect(result).toBeCloseTo(0.725, 2)
  })

  it('handles K larger than candidates', () => {
    const row = makeEvalRow()
    const result = computeFuturePathCorrAtK(row, 10)

    // All 3 candidates: (0.85 + 0.60 + 0.40) / 3 = 0.6167
    expect(result).toBeCloseTo(0.617, 2)
  })

  it('returns 0 for empty candidates', () => {
    const row = makeEvalRow({ candidates: [] })
    expect(computeFuturePathCorrAtK(row, 5)).toBe(0)
  })
})

describe('TCAR-011: computePeakHitAtK', () => {
  it('returns 1 when a candidate peak is within tolerance of query peak', () => {
    const row = makeEvalRow({
      queryPeakDay: 20,
      candidates: [
        { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 18, totalDays: 40, futurePathCorrelation: 0.8 },
      ],
    })
    // |20 - 18| = 2 days, default tolerance = 5 days
    const result = computePeakHitAtK(row, 1, { toleranceDays: 5 })
    expect(result).toBe(1)
  })

  it('returns 0 when no candidate peak is within tolerance', () => {
    const row = makeEvalRow({
      queryPeakDay: 20,
      candidates: [
        { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 50, totalDays: 60, futurePathCorrelation: 0.8 },
      ],
    })
    const result = computePeakHitAtK(row, 1, { toleranceDays: 5 })
    expect(result).toBe(0)
  })

  it('checks only top-K candidates', () => {
    const row = makeEvalRow({
      queryPeakDay: 20,
      candidates: [
        { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 50, totalDays: 60, futurePathCorrelation: 0.8 },
        { candidateEpisodeId: 'ep-2', rank: 2, peakDay: 19, totalDays: 45, futurePathCorrelation: 0.6 },
      ],
    })
    // K=1: only ep-1 (miss), K=2: ep-2 hits
    expect(computePeakHitAtK(row, 1, { toleranceDays: 5 })).toBe(0)
    expect(computePeakHitAtK(row, 2, { toleranceDays: 5 })).toBe(1)
  })
})

describe('TCAR-011: computePeakGapAtK', () => {
  it('returns minimum absolute peak gap from top-K candidates', () => {
    const row = makeEvalRow({
      queryPeakDay: 20,
      candidates: [
        { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 25, totalDays: 40, futurePathCorrelation: 0.8 },
        { candidateEpisodeId: 'ep-2', rank: 2, peakDay: 18, totalDays: 40, futurePathCorrelation: 0.6 },
      ],
    })
    // |20-25|=5, |20-18|=2 → min gap = 2
    const result = computePeakGapAtK(row, 2)
    expect(result).toBe(2)
  })

  it('returns null for empty candidates', () => {
    const row = makeEvalRow({ candidates: [] })
    expect(computePeakGapAtK(row, 5)).toBeNull()
  })
})

describe('TCAR-011: computeRetrievalMetricReport', () => {
  it('computes aggregate metrics across multiple eval rows', () => {
    const rows: EvalRow[] = [
      makeEvalRow({
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 18, totalDays: 40, futurePathCorrelation: 0.90 },
          { candidateEpisodeId: 'ep-2', rank: 2, peakDay: 22, totalDays: 45, futurePathCorrelation: 0.80 },
        ],
      }),
      makeEvalRow({
        queryPeakDay: 15,
        candidates: [
          { candidateEpisodeId: 'ep-3', rank: 1, peakDay: 14, totalDays: 35, futurePathCorrelation: 0.70 },
          { candidateEpisodeId: 'ep-4', rank: 2, peakDay: 30, totalDays: 50, futurePathCorrelation: 0.50 },
        ],
      }),
    ]

    const report = computeRetrievalMetricReport(rows, { k: 5, peakHitToleranceDays: 5 })

    expect(report.futurePathCorrAtK).toBeGreaterThan(0)
    expect(report.peakHitAtK).toBeGreaterThanOrEqual(0)
    expect(report.peakHitAtK).toBeLessThanOrEqual(1)
    expect(report.medianPeakGapAtK).toBeGreaterThanOrEqual(0)
    expect(report.evalRowCount).toBe(2)
  })

  it('computes proper median for even-N gap arrays', () => {
    // 4 rows with known peak gaps: [2, 4, 6, 8] → sorted → median = (4+6)/2 = 5
    const rows: EvalRow[] = [
      makeEvalRow({
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 22, totalDays: 40, futurePathCorrelation: 0.8 },
        ],
      }),
      makeEvalRow({
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-2', rank: 1, peakDay: 24, totalDays: 40, futurePathCorrelation: 0.8 },
        ],
      }),
      makeEvalRow({
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-3', rank: 1, peakDay: 26, totalDays: 40, futurePathCorrelation: 0.8 },
        ],
      }),
      makeEvalRow({
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-4', rank: 1, peakDay: 28, totalDays: 40, futurePathCorrelation: 0.8 },
        ],
      }),
    ]

    const report = computeRetrievalMetricReport(rows, { k: 5, peakHitToleranceDays: 5 })
    // Gaps: [2, 4, 6, 8] → median = (4+6)/2 = 5
    expect(report.medianPeakGapAtK).toBe(5)
  })

  it('flags insufficient data when below minimum N', () => {
    const rows: EvalRow[] = [makeEvalRow()]

    const report = computeRetrievalMetricReport(rows, {
      k: 5,
      peakHitToleranceDays: 5,
      minimumN: 50,
    })

    expect(report.insufficientData).toBe(true)
  })

  it('does not flag insufficient data when at or above minimum N', () => {
    const rows = Array.from({ length: 50 }, () => makeEvalRow())

    const report = computeRetrievalMetricReport(rows, {
      k: 5,
      peakHitToleranceDays: 5,
      minimumN: 50,
    })

    expect(report.insufficientData).toBe(false)
  })
})

describe('TCAR-011: blockBootstrapLowerBound', () => {
  it('returns a lower bound less than or equal to the sample mean', () => {
    const values = [0.8, 0.85, 0.7, 0.9, 0.75, 0.88, 0.82, 0.79, 0.91, 0.87]
    const blockLabels = ['W1', 'W1', 'W2', 'W2', 'W3', 'W3', 'W4', 'W4', 'W5', 'W5']

    const lowerBound = blockBootstrapLowerBound(values, blockLabels, {
      iterations: 500,
      confidenceLevel: 0.9,
    })

    const mean = values.reduce((a, b) => a + b) / values.length
    expect(lowerBound).toBeLessThanOrEqual(mean)
    expect(lowerBound).toBeGreaterThan(0)
  })

  it('returns 0 for empty input', () => {
    expect(blockBootstrapLowerBound([], [], { iterations: 100, confidenceLevel: 0.9 })).toBe(0)
  })

  it('respects confidence level ordering', () => {
    const values = [0.8, 0.85, 0.7, 0.9, 0.75, 0.88, 0.82, 0.79, 0.91, 0.87]
    const labels = ['W1', 'W1', 'W2', 'W2', 'W3', 'W3', 'W4', 'W4', 'W5', 'W5']

    const lb90 = blockBootstrapLowerBound(values, labels, { iterations: 1000, confidenceLevel: 0.9 })
    const lb95 = blockBootstrapLowerBound(values, labels, { iterations: 1000, confidenceLevel: 0.95 })

    // 95% CI lower bound should be <= 90% CI lower bound
    expect(lb95).toBeLessThanOrEqual(lb90 + 0.05) // Allow small numeric noise
  })
})

describe('TCAR-011: computeSliceWiseMetrics', () => {
  it('groups rows by slice and computes per-slice metrics', () => {
    const rows: EvalRow[] = [
      makeEvalRow({
        queryStage: 'Growth',
        queryPeakDay: 20,
        candidates: [
          { candidateEpisodeId: 'ep-1', rank: 1, peakDay: 18, totalDays: 40, futurePathCorrelation: 0.90 },
        ],
      }),
      makeEvalRow({
        queryStage: 'Growth',
        queryPeakDay: 25,
        candidates: [
          { candidateEpisodeId: 'ep-2', rank: 1, peakDay: 24, totalDays: 45, futurePathCorrelation: 0.80 },
        ],
      }),
      makeEvalRow({
        queryStage: 'Peak',
        queryPeakDay: 10,
        candidates: [
          { candidateEpisodeId: 'ep-3', rank: 1, peakDay: 12, totalDays: 30, futurePathCorrelation: 0.70 },
        ],
      }),
    ]

    const result = computeSliceWiseMetrics(rows, {
      k: 5,
      peakHitToleranceDays: 5,
      sliceBy: (row) => row.queryStage,
    })

    expect(result).toHaveLength(2)

    const growthSlice = result.find((s: SliceMetricReport) => s.sliceName === 'Growth')
    const peakSlice = result.find((s: SliceMetricReport) => s.sliceName === 'Peak')

    expect(growthSlice).toBeDefined()
    expect(growthSlice!.evalRowCount).toBe(2)
    expect(peakSlice).toBeDefined()
    expect(peakSlice!.evalRowCount).toBe(1)
  })

  it('returns insufficient-data verdict when slice has fewer rows than minimumN', () => {
    const rows: EvalRow[] = [
      makeEvalRow({ queryStage: 'Emerging' }),
      makeEvalRow({ queryStage: 'Emerging' }),
    ]

    const result = computeSliceWiseMetrics(rows, {
      k: 5,
      peakHitToleranceDays: 5,
      minimumN: 10,
      sliceBy: (row) => row.queryStage,
    })

    expect(result).toHaveLength(1)
    expect(result[0].sliceName).toBe('Emerging')
    expect(result[0].insufficientData).toBe(true)
  })

  it('returns empty array when no rows are provided', () => {
    const result = computeSliceWiseMetrics([], {
      k: 5,
      peakHitToleranceDays: 5,
      sliceBy: (row) => row.queryStage,
    })

    expect(result).toHaveLength(0)
  })

  it('supports custom slice functions beyond stage', () => {
    const rows: EvalRow[] = [
      makeEvalRow({ queryWeekCohort: '2026-W05' }),
      makeEvalRow({ queryWeekCohort: '2026-W05' }),
      makeEvalRow({ queryWeekCohort: '2026-W06' }),
    ]

    const result = computeSliceWiseMetrics(rows, {
      k: 5,
      peakHitToleranceDays: 5,
      sliceBy: (row) => row.queryWeekCohort,
    })

    expect(result).toHaveLength(2)
    expect(result.map((s: SliceMetricReport) => s.sliceName).sort()).toEqual(['2026-W05', '2026-W06'])
  })
})
