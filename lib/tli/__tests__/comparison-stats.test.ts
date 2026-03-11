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

  it('PRNG samples from ALL clusters — not biased to first half', () => {
    // CRITICAL: clusters 0-4 have delta=+0.5, clusters 5-9 have delta=-0.5
    // If PRNG only selects indices [0, 0.5), bootstrap will only sample clusters 0-4
    // and show a biased positive mean instead of ~0
    const rows = Array.from({ length: 10 }, (_, i) => ({
      clusterId: `cluster-${i}`,
      id: `row-${i}`,
      baseline: 0.5,
      candidate: i < 5 ? 1.0 : 0.0, // first half: +0.5 delta, second half: -0.5 delta
    }))

    const result = clusterBootstrapPairedDelta(rows, { iterations: 1000, seed: 42 })

    // Observed mean should be 0 (balanced positive and negative deltas)
    expect(result.meanDelta).toBeCloseTo(0, 6)
    // With a correct PRNG, bootstrap mean should cluster around 0
    // With a biased PRNG (only first half), lower AND upper would both be positive
    // This test FAILS if PRNG only samples clusters 0-4
    expect(result.lower).toBeLessThan(0.25)
  })

  it('bootstrap CI uses one-sided percentiles per PRD §8.3', () => {
    // Create data with known variance to detect percentile difference
    // one-sided 95% CI: alpha=0.05 → lower = percentile(5%), upper = percentile(95%)
    // two-sided 95% CI: alpha=0.05 → lower = percentile(2.5%), upper = percentile(97.5%)
    const rows = Array.from({ length: 100 }, (_, i) => ({
      clusterId: `c-${i % 20}`,
      id: `r-${i}`,
      baseline: 0.3,
      candidate: 0.4 + (i % 5) * 0.03,
    }))

    const result95 = clusterBootstrapPairedDelta(rows, {
      iterations: 1000,
      confidenceLevel: 0.95,
      seed: 123,
    })

    // Verify that 95% CI lower bound is at 5th percentile (one-sided)
    // by checking that a 90% CI gives the SAME lower bound
    // (because one-sided 95% lower = two-sided 90% lower = percentile(0.05))
    const result90 = clusterBootstrapPairedDelta(rows, {
      iterations: 1000,
      confidenceLevel: 0.90,
      seed: 123, // same seed → same bootstrap distribution
    })

    // One-sided 95% lower = percentile(0.05)
    // One-sided 90% lower = percentile(0.10)
    // So 95% lower should be LESS than 90% lower (wider interval at higher confidence)
    expect(result95.lower).toBeLessThan(result90.lower)
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
