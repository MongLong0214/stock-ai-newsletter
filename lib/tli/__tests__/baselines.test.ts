import { describe, expect, it } from 'vitest'
import {
  buildBAblPredictions,
  buildBaselineReport,
  buildM0Predictions,
  evaluateBaselinePredictions,
  scoreM0,
  type BaselineFeatureRow,
  type BaselineGtLabelRow,
  type BaselineSnapshotRow,
} from '@/lib/tli/model/baselines'

const labels = [
  { themeId: 'theme-a', baseDate: '2026-07-01', y: true },
  { themeId: 'theme-b', baseDate: '2026-07-01', y: false },
  { themeId: 'theme-c', baseDate: '2026-07-01', y: true },
] satisfies readonly BaselineGtLabelRow[]

const snapshots = [
  { themeId: 'theme-a', snapshotDate: '2026-07-01', phase: 'rising' },
  { themeId: 'theme-b', snapshotDate: '2026-07-01', phase: 'cooling' },
  { themeId: 'theme-c', snapshotDate: '2026-07-02', phase: 'rising' },
] satisfies readonly BaselineSnapshotRow[]

describe('T-202 baselines', () => {
  it('joins B-abl snapshots to final GT-A labels by theme and date', () => {
    const predictions = buildBAblPredictions({ labels, snapshots })

    expect(predictions).toEqual([
      { id: 'theme-a|2026-07-01', themeId: 'theme-a', baseDate: '2026-07-01', probability: 1, y: true },
      { id: 'theme-b|2026-07-01', themeId: 'theme-b', baseDate: '2026-07-01', probability: 0, y: false },
    ])
  })

  it('computes Brier, precision, P@10, coverage, and base rate', () => {
    const metrics = evaluateBaselinePredictions({
      predictions: [
        { id: 'a', themeId: 'a', baseDate: '2026-07-01', probability: 0.8, y: true },
        { id: 'b', themeId: 'b', baseDate: '2026-07-01', probability: 0.7, y: false },
        { id: 'c', themeId: 'c', baseDate: '2026-07-01', probability: null, y: true },
      ],
      totalCandidates: 3,
      pAtK: 2,
    })

    expect(metrics.nScored).toBe(2)
    expect(metrics.coverage).toBeCloseTo(2 / 3, 6)
    expect(metrics.baseRate).toBeCloseTo(0.5, 6)
    expect(metrics.brier).toBeCloseTo(((0.2 ** 2) + (0.7 ** 2)) / 2, 6)
    expect(metrics.precision).toBeCloseTo(0.5, 6)
    expect(metrics.pAt10).toBeCloseTo(0.5, 6)
  })

  it('implements the M0 rule: slope_7d > 0 and news_momentum > 1', () => {
    expect(scoreM0({ interestSlope7d: 0.2, newsMomentum: 1.1, baseRate: 0.35 })).toBe(0.35)
    expect(scoreM0({ interestSlope7d: 0, newsMomentum: 1.1, baseRate: 0.35 })).toBe(0.65)
    expect(scoreM0({ interestSlope7d: 0.2, newsMomentum: 1, baseRate: 0.35 })).toBe(0.65)
  })

  it('builds M0 predictions from T-201 feature vectors using only M0 rule inputs', () => {
    const featureRows = [
      { themeId: 'theme-a', baseDate: '2026-07-01', values: [0.2, 0, 0, 0, 0, 1.2], missingFlags: [], abstain: false, y: true },
      { themeId: 'theme-b', baseDate: '2026-07-01', values: [-0.1, 0, 0, 0, 0, 0.2], missingFlags: [], abstain: false, y: false },
      { themeId: 'theme-c', baseDate: '2026-07-01', values: [0.2, 0, 0, 0, 0, 1.2], missingFlags: [], abstain: true, y: true },
    ] satisfies readonly BaselineFeatureRow[]

    expect(buildM0Predictions({ featureRows, baseRate: 0.4 })).toEqual([
      { id: 'theme-a|2026-07-01', themeId: 'theme-a', baseDate: '2026-07-01', probability: 0.4, y: true },
      { id: 'theme-b|2026-07-01', themeId: 'theme-b', baseDate: '2026-07-01', probability: 0.6, y: false },
      { id: 'theme-c|2026-07-01', themeId: 'theme-c', baseDate: '2026-07-01', probability: 0.4, y: true },
    ])
  })

  it('builds a two-baseline report from labels, snapshots, and feature rows', () => {
    const report = buildBaselineReport({
      labels,
      snapshots,
      featureRows: [
        { themeId: 'theme-a', baseDate: '2026-07-01', values: [0.2, 0, 0, 0, 0, 1.2], missingFlags: [], abstain: false, y: true },
        { themeId: 'theme-b', baseDate: '2026-07-01', values: [-0.1, 0, 0, 0, 0, 0.2], missingFlags: [], abstain: false, y: false },
        { themeId: 'theme-c', baseDate: '2026-07-01', values: [0.2, 0, 0, 0, 0, 1.2], missingFlags: [], abstain: false, y: true },
      ],
    })

    expect(report.baseRate).toBeCloseTo(2 / 3, 6)
    expect(report.baselines.bAbl.nScored).toBe(2)
    expect(report.baselines.m0.nScored).toBe(3)
    expect(report.baselines.bAbl.brier).not.toBeNull()
    expect(report.baselines.m0.pAt10).not.toBeNull()
  })
})
