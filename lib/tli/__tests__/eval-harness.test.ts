import { describe, expect, it } from 'vitest'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import {
  computeBrierDeltaCi,
  computeEceClusterBootstrapUpper95,
  createWalkForwardFolds,
  evaluatePredictionRows,
  evaluatePredictionRowsWithEceUpper95,
  evaluateWithWeeklyMondaySubset,
  selectWeeklyMondaySubset,
  type EvalObservation,
  type EvalPredictionRow,
} from '@/lib/tli/eval/harness'

const tradingDates = [
  '2026-07-01',
  '2026-07-02',
  '2026-07-03',
  '2026-07-06',
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
  '2026-07-10',
  '2026-07-13',
  '2026-07-14',
  '2026-07-15',
  '2026-07-16',
  '2026-07-17',
  '2026-07-20',
  '2026-07-21',
] as const

const observations = tradingDates.flatMap((baseDate) => (
  ['theme-a', 'theme-b'].map((themeId) => ({
    id: `${themeId}|${baseDate}`,
    themeId,
    baseDate,
  }))
)) satisfies readonly EvalObservation[]

describe('T-204 eval harness', () => {
  it('creates walk-forward folds with a 5 Korean-trading-day purge gap', () => {
    const folds = createWalkForwardFolds(observations, { foldCount: 2, testWindowDateCount: 2 })

    expect(folds).toHaveLength(2)
    for (const fold of folds) {
      const cutoff = addKoreanTradingDays(fold.testDateRange.start, -5)
      expect(fold.train.every((row) => row.baseDate <= cutoff)).toBe(true)
      expect(fold.purge.every((row) => row.baseDate > cutoff && row.baseDate < fold.testDateRange.start)).toBe(true)
      expect(fold.test.every((row) => row.baseDate >= fold.testDateRange.start)).toBe(true)
      expect(fold.trainClusterCount).toBe(2)
      expect(fold.testClusterCount).toBe(2)
    }
  })

  it('computes Brier, quantile ECE, daily IC, and daily Rising-P@K', () => {
    const rows = [
      { id: 'a', themeId: 'ta', baseDate: '2026-07-06', probability: 0.9, y: true },
      { id: 'b', themeId: 'tb', baseDate: '2026-07-06', probability: 0.8, y: false },
      { id: 'c', themeId: 'tc', baseDate: '2026-07-06', probability: 0.7, y: true },
      { id: 'd', themeId: 'td', baseDate: '2026-07-07', probability: 0.1, y: false },
      { id: 'e', themeId: 'te', baseDate: '2026-07-07', probability: 0.2, y: false },
      { id: 'f', themeId: 'tf', baseDate: '2026-07-07', probability: 0.95, y: true },
    ] satisfies readonly EvalPredictionRow[]

    const metrics = evaluatePredictionRows(rows, { eceMinBinSize: 2, pAtK: 2 })

    expect(metrics.totalCandidates).toBe(6)
    expect(metrics.nScored).toBe(6)
    expect(metrics.coverage).toBe(1)
    expect(metrics.baseRate).toBeCloseTo(0.5, 6)
    expect(metrics.brier).toBeCloseTo(0.132083, 6)
    expect(metrics.eceBinCount).toBe(3)
    expect(metrics.ece).toBeCloseTo(0.158333, 6)
    expect(metrics.ic).toBeGreaterThan(0)
    expect(metrics.risingPAt10).toBeCloseTo(0.5, 6)
  })

  it('extracts the non-overlapping weekly Monday subset', () => {
    const weekly = selectWeeklyMondaySubset(observations)

    expect([...new Set(weekly.map((row) => row.baseDate))]).toEqual([
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
    ])
  })

  it('reports raw n and non-overlapping n with paired metric summaries', () => {
    const rows = observations.map((row, index) => ({
      ...row,
      probability: index % 2 === 0 ? 0.7 : 0.3,
      y: index % 2 === 0,
    })) satisfies readonly EvalPredictionRow[]

    const summary = evaluateWithWeeklyMondaySubset(rows, { eceMinBinSize: 2 })

    expect(summary.rawN).toBe(rows.length)
    expect(summary.nonOverlappingN).toBe(6)
    expect(summary.raw.nScored).toBe(rows.length)
    expect(summary.weeklyMonday.nScored).toBe(6)
  })

  it('computes paired Brier delta CI with theme clusters', () => {
    const baseline = Array.from({ length: 8 }, (_, index) => ({
      id: `row-${index}`,
      themeId: `theme-${index % 4}`,
      baseDate: '2026-07-06',
      probability: index % 2 === 0 ? 0.6 : 0.4,
      y: index % 2 === 0,
    })) satisfies readonly EvalPredictionRow[]
    const candidate = baseline.map((row) => ({
      ...row,
      probability: row.y ? 0.8 : 0.2,
    })) satisfies readonly EvalPredictionRow[]

    const ci = computeBrierDeltaCi({ baseline, candidate, iterations: 200, seed: 7 })

    expect(ci.method).toBe('cluster_bootstrap')
    expect(ci.clusterCount).toBe(4)
    expect(ci.observationCount).toBe(8)
    expect(ci.meanDelta).toBeLessThan(0)
    expect(ci.lower).toBeLessThanOrEqual(ci.upper)
  })

  it('N4: computes a reproducible ECE cluster-bootstrap upper95 with a fixed seed', () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      id: `row-${index}`,
      themeId: `theme-${index % 8}`,
      baseDate: '2026-07-06',
      probability: index % 2 === 0 ? 0.9 : 0.2,
      y: index % 3 === 0,
    })) satisfies readonly EvalPredictionRow[]

    const first = computeEceClusterBootstrapUpper95(rows, { iterations: 200, seed: 7, minBinSize: 2 })
    const second = computeEceClusterBootstrapUpper95(rows, { iterations: 200, seed: 7, minBinSize: 2 })

    expect(Number.isFinite(first)).toBe(true)
    expect(first).toBe(second)

    const metrics = evaluatePredictionRowsWithEceUpper95(rows, { eceMinBinSize: 2, bootstrapIterations: 200, bootstrapSeed: 7 })
    expect(metrics.eceUpper95).toBe(first)
    expect(evaluatePredictionRows(rows, { eceMinBinSize: 2 }).eceUpper95).toBeNull()
  })

  it('switches to wild cluster bootstrap when one theme dominates labels', () => {
    const baseline = Array.from({ length: 50 }, (_, index) => ({
      id: `row-${index}`,
      themeId: index < 40 ? 'theme-heavy' : `theme-${index}`,
      baseDate: '2026-07-06',
      probability: 0.5,
      y: index % 2 === 0,
    })) satisfies readonly EvalPredictionRow[]
    const candidate = baseline.map((row) => ({
      ...row,
      probability: row.y ? 0.6 : 0.4,
    })) satisfies readonly EvalPredictionRow[]

    const ci = computeBrierDeltaCi({ baseline, candidate, iterations: 200, seed: 11 })

    expect(ci.method).toBe('wild_cluster_bootstrap')
    expect(ci.imbalance.useWildClusterBootstrap).toBe(true)
    expect(ci.imbalance.topClusterShare).toBeGreaterThan(0.3)
  })
})
