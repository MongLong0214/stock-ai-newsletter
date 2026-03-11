import { describe, expect, it } from 'vitest'
import {
  assignRollingOriginFolds,
  createEmbargoedTemporalSplits,
  computePairedDelta,
  clusterBootstrapPairedDelta,
  renderPowerAnalysisReport,
} from '../stats/comparison-stats'

describe('comparison stats', () => {
  const makeIsoDates = (count: number, start = '2026-01-01') =>
    Array.from({ length: count }, (_, idx) => {
      const date = new Date(`${start}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + idx)
      return date.toISOString().split('T')[0]
    })

  it('creates at least three rolling-origin folds from dated observations', () => {
    const observations = makeIsoDates(60).map((runDate) => ({
      runDate,
    }))

    const folds = assignRollingOriginFolds(observations, 3)
    expect(folds).toHaveLength(3)
    expect(folds[0].train.length).toBeGreaterThan(0)
    expect(folds[0].validation.length).toBeGreaterThan(0)
    expect(folds[0].test.length).toBeGreaterThan(0)
  })

  it('keeps the same runDate in a single fold partition', () => {
    const observations = [
      { runDate: '2026-01-01', id: 'a1' },
      { runDate: '2026-01-01', id: 'a2' },
      { runDate: '2026-01-01', id: 'a3' },
      { runDate: '2026-01-02', id: 'b1' },
      { runDate: '2026-01-02', id: 'b2' },
      { runDate: '2026-01-02', id: 'b3' },
      { runDate: '2026-01-03', id: 'c1' },
      { runDate: '2026-01-03', id: 'c2' },
      { runDate: '2026-01-03', id: 'c3' },
      { runDate: '2026-01-04', id: 'd1' },
      { runDate: '2026-01-04', id: 'd2' },
      { runDate: '2026-01-04', id: 'd3' },
      { runDate: '2026-01-05', id: 'e1' },
      { runDate: '2026-01-05', id: 'e2' },
      { runDate: '2026-01-05', id: 'e3' },
      { runDate: '2026-01-06', id: 'f1' },
      { runDate: '2026-01-06', id: 'f2' },
      { runDate: '2026-01-06', id: 'f3' },
    ]

    const folds = assignRollingOriginFolds(observations, 3)
    const locate = (runDate: string) =>
      folds.map((fold, idx) => ({
        idx,
        train: fold.train.some(item => item.runDate === runDate),
        validation: fold.validation.some(item => item.runDate === runDate),
        test: fold.test.some(item => item.runDate === runDate),
      }))

    for (const runDate of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06']) {
      for (const placement of locate(runDate)) {
        const buckets = [placement.train, placement.validation, placement.test].filter(Boolean)
        expect(buckets.length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('creates embargoed train/validation/test ranges without overlap', () => {
    const dates = makeIsoDates(60, '2026-02-01')
    const split = createEmbargoedTemporalSplits(dates, { trainRatio: 0.6, validationRatio: 0.2, embargoDays: 14 })

    const trainSet = new Set(split.train)
    const validationSet = new Set(split.validation)
    const testSet = new Set(split.test)

    expect([...trainSet].every(d => !validationSet.has(d) && !testSet.has(d))).toBe(true)
    expect([...validationSet].every(d => !testSet.has(d))).toBe(true)
    expect(split.embargo.length).toBeGreaterThan(0)
  })

  it('uses calendar-day embargo instead of raw item count', () => {
    const dates = [
      '2026-02-01',
      '2026-02-08',
      '2026-02-15',
      '2026-02-22',
      '2026-03-01',
      '2026-03-08',
      '2026-03-15',
      '2026-03-22',
    ]
    const split = createEmbargoedTemporalSplits(dates, { trainRatio: 0.5, validationRatio: 0.125, embargoDays: 14 })

    expect(split.validation).toEqual(['2026-03-01'])
    expect(split.embargo).toEqual(['2026-03-08', '2026-03-15'])
    expect(split.test).toEqual(['2026-03-22'])
  })

  it('computes paired deltas by matching ids', () => {
    const delta = computePairedDelta(
      [
        { id: 'a', value: 0.5 },
        { id: 'b', value: 0.4 },
      ],
      [
        { id: 'a', value: 0.6 },
        { id: 'b', value: 0.5 },
      ],
    )

    expect(delta.meanDelta).toBeCloseTo(0.1, 6)
    expect(delta.count).toBe(2)
  })

  it('bootstrap uses cluster ids and returns a bounded interval', () => {
    const result = clusterBootstrapPairedDelta(
      [
        { clusterId: 'theme-a', id: 'a1', baseline: 0.2, candidate: 0.3 },
        { clusterId: 'theme-a', id: 'a2', baseline: 0.1, candidate: 0.2 },
        { clusterId: 'theme-b', id: 'b1', baseline: 0.3, candidate: 0.4 },
        { clusterId: 'theme-c', id: 'c1', baseline: 0.4, candidate: 0.5 },
      ],
      { iterations: 200, confidenceLevel: 0.95, seed: 7 },
    )

    expect(result.clusterCount).toBe(3)
    expect(result.meanDelta).toBeGreaterThan(0)
    expect(result.lower).toBeLessThanOrEqual(result.upper)
  })

  it('renders a power analysis report with the key inputs', () => {
    const report = renderPowerAnalysisReport({
      primaryMetric: 'Phase-Aligned Precision@3',
      margin: -0.03,
      minimumDetectableEffect: 0.05,
      clusterCount: 30,
      eligibleRuns: 120,
      confidenceLevel: 0.95,
    })

    expect(report).toContain('# Comparison v4 Power Analysis')
    expect(report).toContain('Phase-Aligned Precision@3')
    expect(report).toContain('-0.03')
    expect(report).toContain('120')
  })
})
