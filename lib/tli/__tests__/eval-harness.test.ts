import { describe, expect, it } from 'vitest'
import { addKoreanTradingDays } from '@/lib/tli/trading-calendar'
import {
  computeBrierDeltaCi,
  computeEceClusterBootstrapUpper95,
  computeQuantileEce,
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

const computeNaiveQuantileEce = (
  rows: readonly EvalPredictionRow[],
  options: { readonly binCount: number; readonly minBinSize: number },
): { readonly ece: number | null; readonly binCount: number } => {
  const scored = rows.flatMap((row) => (
    row.probability === null || !Number.isFinite(row.probability)
      ? []
      : [{ probability: row.probability, actual: row.y ? 1 : 0 }]
  )).sort((left, right) => left.probability - right.probability)
  if (scored.length < options.minBinSize) return { ece: null, binCount: 0 }
  const binCount = Math.max(1, Math.min(options.binCount, Math.floor(scored.length / options.minBinSize)))
  let ece = 0
  for (let index = 0; index < binCount; index++) {
    const start = Math.floor(index * scored.length / binCount)
    const end = Math.floor((index + 1) * scored.length / binCount)
    const bin = scored.slice(start, end)
    const predicted = bin.reduce((sum, row) => sum + row.probability, 0) / bin.length
    const actual = bin.reduce((sum, row) => sum + row.actual, 0) / bin.length
    ece += (bin.length / scored.length) * Math.abs(predicted - actual)
  }
  return { ece: Number.isFinite(ece) ? ece : 1, binCount }
}

const calendarDayGap = (left: string, right: string): number => (
  (Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000)
)

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

  it('keeps identical-probability rows in one quantile ECE bin when a nominal cut lands inside a tie', () => {
    const rows = [
      { id: 'p10-a', themeId: 'theme-a', baseDate: '2026-07-06', probability: 0.1, y: false },
      { id: 'p20-a', themeId: 'theme-b', baseDate: '2026-07-06', probability: 0.2, y: false },
      { id: 'p20-b', themeId: 'theme-c', baseDate: '2026-07-06', probability: 0.2, y: false },
      { id: 'p20-c', themeId: 'theme-d', baseDate: '2026-07-06', probability: 0.2, y: true },
      { id: 'p80-a', themeId: 'theme-e', baseDate: '2026-07-06', probability: 0.8, y: true },
      { id: 'p90-a', themeId: 'theme-f', baseDate: '2026-07-06', probability: 0.9, y: true },
    ] satisfies readonly EvalPredictionRow[]

    const naive = computeNaiveQuantileEce(rows, { binCount: 3, minBinSize: 1 })
    const tieAware = computeQuantileEce(rows, { binCount: 3, minBinSize: 1 })

    expect(naive.ece).toBeCloseTo(0.2, 6)
    expect(tieAware.ece).not.toBeCloseTo(naive.ece ?? 0, 6)
    expect(tieAware.binCount).toBe(2)
    expect(tieAware.ece).toBeCloseTo(0.1, 6)
  })

  it('collapses all-identical-probability ECE input into one bin', () => {
    const rows = [
      { id: 'row-1', themeId: 'theme-a', baseDate: '2026-07-06', probability: 0.2, y: true },
      { id: 'row-2', themeId: 'theme-b', baseDate: '2026-07-06', probability: 0.2, y: false },
      { id: 'row-3', themeId: 'theme-c', baseDate: '2026-07-06', probability: 0.2, y: false },
      { id: 'row-4', themeId: 'theme-d', baseDate: '2026-07-06', probability: 0.2, y: false },
    ] satisfies readonly EvalPredictionRow[]

    const result = computeQuantileEce(rows, { binCount: 4, minBinSize: 1 })

    expect(result.binCount).toBe(1)
    expect(result.ece).toBeCloseTo(0.05, 6)
  })

  it('extracts the first available trading day from each ISO week', () => {
    const weekly = selectWeeklyMondaySubset(observations)

    expect([...new Set(weekly.map((row) => row.baseDate))]).toEqual([
      '2026-07-01',
      '2026-07-06',
      '2026-07-13',
      '2026-07-20',
    ])
  })

  it('keeps a week when Monday is absent by selecting that week’s first available trading day', () => {
    const holidayWeekRows = [
      { id: 'theme-a|2026-07-07', themeId: 'theme-a', baseDate: '2026-07-07' },
      { id: 'theme-b|2026-07-07', themeId: 'theme-b', baseDate: '2026-07-07' },
      { id: 'theme-a|2026-07-08', themeId: 'theme-a', baseDate: '2026-07-08' },
    ] satisfies readonly EvalObservation[]

    const weekly = selectWeeklyMondaySubset(holidayWeekRows)

    expect(weekly.map((row) => row.id)).toEqual(['theme-a|2026-07-07', 'theme-b|2026-07-07'])
  })

  it('selects one representative trading date from consecutive ISO weeks with at least a five-day gap', () => {
    const consecutiveWeekRows = [
      { id: 'week-1-tue', themeId: 'theme-a', baseDate: '2026-07-07' },
      { id: 'week-1-wed', themeId: 'theme-a', baseDate: '2026-07-08' },
      { id: 'week-2-mon', themeId: 'theme-a', baseDate: '2026-07-13' },
      { id: 'week-2-tue', themeId: 'theme-a', baseDate: '2026-07-14' },
    ] satisfies readonly EvalObservation[]

    const weeklyDates = [...new Set(selectWeeklyMondaySubset(consecutiveWeekRows).map((row) => row.baseDate))]

    expect(weeklyDates).toEqual(['2026-07-07', '2026-07-13'])
    expect(calendarDayGap(weeklyDates[0], weeklyDates[1])).toBeGreaterThanOrEqual(5)
  })

  it('retains every theme row on the selected first trading day of a week', () => {
    const multiThemeRows = [
      { id: 'theme-a|2026-07-07', themeId: 'theme-a', baseDate: '2026-07-07' },
      { id: 'theme-b|2026-07-07', themeId: 'theme-b', baseDate: '2026-07-07' },
      { id: 'theme-a|2026-07-08', themeId: 'theme-a', baseDate: '2026-07-08' },
      { id: 'theme-b|2026-07-08', themeId: 'theme-b', baseDate: '2026-07-08' },
    ] satisfies readonly EvalObservation[]

    const weekly = selectWeeklyMondaySubset(multiThemeRows)

    expect(weekly.map((row) => row.id)).toEqual(['theme-a|2026-07-07', 'theme-b|2026-07-07'])
  })

  it('reports raw n and non-overlapping n with paired metric summaries', () => {
    const rows = observations.map((row, index) => ({
      ...row,
      probability: index % 2 === 0 ? 0.7 : 0.3,
      y: index % 2 === 0,
    })) satisfies readonly EvalPredictionRow[]

    const summary = evaluateWithWeeklyMondaySubset(rows, { eceMinBinSize: 2 })

    expect(summary.rawN).toBe(rows.length)
    expect(summary.nonOverlappingN).toBe(8)
    expect(summary.raw.nScored).toBe(rows.length)
    expect(summary.weeklyMonday.nScored).toBe(8)
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
