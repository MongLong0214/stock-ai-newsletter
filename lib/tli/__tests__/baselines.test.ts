import { describe, expect, it } from 'vitest'
import {
  buildBAblPredictions,
  buildBaselineReport,
  buildM0Predictions,
  evaluateBaselinePredictions,
  fitBAblStrataBaseline,
  fitClimatologyBaseline,
  fitPersistenceBaseline,
  fitScientificBaselines,
  jeffreysProbability,
  predictBAblStrataBaseline,
  predictPersistenceBaseline,
  scoreM0,
  toBAblStratum,
  toPersistenceStratum,
  type BaselineFeatureRow,
  type BaselineGtLabelRow,
  type BaselineSnapshotRow,
  type ScientificBaselineTrainRow,
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

const STUDY = { studyContractId: 'study-1', studyContractSha256: 'a'.repeat(64) } as const

/**
 * 7 train rows, hand-countable.
 * B-Abl  rising 3/2+ | cooling 2/0+ | other 2/2+ | missing 0 rows.
 * ret10d positive 3/2+ | nonpositive 2/1+ | missing 2/1+. Whole-train prevalence is 4/7.
 */
const trainRows = [
  { themeId: 't1', originDate: '2026-01-05', bablPhase: 'rising', interestReturn10d: 0.4, y: true },
  { themeId: 't2', originDate: '2026-01-05', bablPhase: 'rising', interestReturn10d: -0.1, y: true },
  { themeId: 't3', originDate: '2026-01-05', bablPhase: 'rising', interestReturn10d: 0.2, y: false },
  { themeId: 't1', originDate: '2026-01-12', bablPhase: 'cooling', interestReturn10d: 0, y: false },
  { themeId: 't2', originDate: '2026-01-12', bablPhase: 'cooling', interestReturn10d: null, y: false },
  { themeId: 't3', originDate: '2026-01-12', bablPhase: 'peaking', interestReturn10d: null, y: true },
  { themeId: 't1', originDate: '2026-01-19', bablPhase: 'peaking', interestReturn10d: 0.3, y: true },
].map((row) => ({ ...row, ...STUDY })) satisfies readonly ScientificBaselineTrainRow[]

const climatologyRows = Array.from({ length: 27 }, (_unused, index) => ({
  themeId: 't1',
  originDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
  bablPhase: null,
  interestReturn10d: null,
  // The oldest origin is positive; of the newest 26 origins, exactly 13 are positive.
  y: index <= 13,
  ...STUDY,
})) satisfies readonly ScientificBaselineTrainRow[]

const predictRow = (bablPhase: string | null, interestReturn10d: number | null) => ({
  id: 'row-1',
  themeId: 't9',
  originDate: '2026-02-02',
  bablPhase,
  interestReturn10d,
})

describe('TLI v3 scientific baselines', () => {
  it('applies Jeffreys smoothing (positive + 0.5) / (n + 1)', () => {
    expect(jeffreysProbability(2, 3)).toBe(0.625)
    expect(jeffreysProbability(0, 0)).toBe(0.5)
    expect(jeffreysProbability(0, 3)).toBe(0.125)
    expect(jeffreysProbability(3, 3)).toBe(0.875)
    expect(() => jeffreysProbability(4, 3)).toThrow(/invalid counts/)
  })

  it('maps B-Abl phases to the four strata and treats an absent tuple as missing', () => {
    expect(toBAblStratum('rising')).toBe('rising')
    expect(toBAblStratum('cooling')).toBe('cooling')
    expect(toBAblStratum('peaking')).toBe('other')
    expect(toBAblStratum(null)).toBe('missing')
    expect(toBAblStratum('')).toBe('missing')
  })

  it('maps interest_return_10d to the three persistence strata', () => {
    expect(toPersistenceStratum(0.001)).toBe('positive')
    expect(toPersistenceStratum(0)).toBe('nonpositive')
    expect(toPersistenceStratum(-1)).toBe('nonpositive')
    expect(toPersistenceStratum(null)).toBe('missing')
    expect(toPersistenceStratum(Number.NaN)).toBe('missing')
  })

  it('fits the primary four-strata B-Abl comparator to exact Jeffreys golden values', () => {
    const artifact = fitBAblStrataBaseline({ rows: trainRows })

    expect(artifact.baselineId).toBe('babl-strata-v1')
    expect(artifact.role).toBe('primary')
    expect(artifact.trainRowCount).toBe(7)
    expect(artifact.trainPositiveCount).toBe(4)
    expect(artifact.strata.rising.probability).toBe(0.625)
    expect(artifact.strata.cooling.probability).toBeCloseTo(0.5 / 3, 15)
    expect(artifact.strata.other.probability).toBeCloseTo(2.5 / 3, 15)
    expect(artifact.globalFallbackProbability).toBe(0.5625)
    expect(artifact.artifactSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('falls back to the smoothed whole-train prevalence for an unseen stratum', () => {
    const artifact = fitBAblStrataBaseline({ rows: trainRows })

    expect(artifact.strata.missing.trainRowCount).toBe(0)
    expect(artifact.strata.missing.usedGlobalFallback).toBe(true)
    expect(artifact.strata.missing.probability).toBe(0.5625)
    expect(artifact.strata.rising.usedGlobalFallback).toBe(false)
  })

  it('scores a missing B-Abl tuple instead of abstaining', () => {
    const artifact = fitBAblStrataBaseline({ rows: trainRows })

    expect(predictBAblStrataBaseline(artifact, predictRow('rising', null))).toBe(0.625)
    expect(predictBAblStrataBaseline(artifact, predictRow('peaking', null))).toBeCloseTo(2.5 / 3, 15)
    expect(predictBAblStrataBaseline(artifact, predictRow(null, null))).toBe(0.5625)
  })

  it('fits the three-strata persistence secondary to exact Jeffreys golden values', () => {
    const artifact = fitPersistenceBaseline({ rows: trainRows })

    expect(artifact.baselineId).toBe('persistence-strata-v1')
    expect(artifact.role).toBe('secondary_diagnostic')
    expect(artifact.strata.positive.probability).toBe(0.625)
    expect(artifact.strata.nonpositive.probability).toBe(0.5)
    expect(artifact.strata.missing.probability).toBe(0.5)
    expect(artifact.strata.missing.usedGlobalFallback).toBe(false)
    expect(predictPersistenceBaseline(artifact, predictRow(null, 0.9))).toBe(0.625)
    expect(predictPersistenceBaseline(artifact, predictRow(null, 0))).toBe(0.5)
  })

  it('uses the global fallback when no train row has a missing interest_return_10d', () => {
    const observedOnly = trainRows.filter((row) => row.interestReturn10d !== null)
    const artifact = fitPersistenceBaseline({ rows: observedOnly })

    expect(artifact.strata.missing.trainRowCount).toBe(0)
    expect(artifact.strata.missing.usedGlobalFallback).toBe(true)
    expect(artifact.strata.missing.probability).toBe(artifact.globalFallbackProbability)
    expect(predictPersistenceBaseline(artifact, predictRow(null, null))).toBe(artifact.globalFallbackProbability)
  })

  it('pools only the 26 training origins immediately before the test origin', () => {
    const artifact = fitClimatologyBaseline({ rows: climatologyRows })

    expect(artifact?.trainOriginsUsed).toHaveLength(26)
    expect(artifact?.trainOriginsUsed).not.toContain('2026-01-01')
    expect(artifact?.trainRowCount).toBe(26)
    expect(artifact?.trainPositiveCount).toBe(13)
    expect(artifact?.probability).toBe(0.5)
  })

  it('does not compute climatology without a prior origin', () => {
    expect(fitClimatologyBaseline({ rows: [] })).toBeNull()
  })

  it('keeps every fitted probability inside the open interval (0,1)', () => {
    const allPositive = trainRows.map((row) => ({ ...row, y: true }))
    const allNegative = trainRows.map((row) => ({ ...row, y: false }))
    const probabilities = [
      ...Object.values(fitBAblStrataBaseline({ rows: allPositive }).strata),
      ...Object.values(fitBAblStrataBaseline({ rows: allNegative }).strata),
    ].map((fit) => fit.probability)

    expect(probabilities).toHaveLength(8)
    for (const probability of probabilities) {
      expect(probability).toBeGreaterThan(0)
      expect(probability).toBeLessThan(1)
    }
  })

  it('never reads test prevalence: flipping held-out labels cannot move a fitted train artifact', () => {
    const testOriginDate = '2026-02-02'
    const dataset = [
      ...trainRows,
      { themeId: 't4', originDate: testOriginDate, bablPhase: 'rising', interestReturn10d: 0.9, y: false, ...STUDY },
      { themeId: 't5', originDate: testOriginDate, bablPhase: 'cooling', interestReturn10d: -0.9, y: true, ...STUDY },
    ] satisfies readonly ScientificBaselineTrainRow[]
    const fitOnTrain = (rows: readonly ScientificBaselineTrainRow[]) => (
      fitScientificBaselines({ rows: rows.filter((row) => row.originDate < testOriginDate) })
    )

    const before = fitOnTrain(dataset)
    const afterTestFlip = fitOnTrain(dataset.map((row) => (
      row.originDate >= testOriginDate ? { ...row, y: !row.y } : row
    )))
    const afterTrainFlip = fitOnTrain(dataset.map((row, index) => (index === 0 ? { ...row, y: !row.y } : row)))

    expect(afterTestFlip.primary.artifactSha256).toBe(before.primary.artifactSha256)
    expect(afterTestFlip.secondary.persistence.artifactSha256).toBe(before.secondary.persistence.artifactSha256)
    expect(afterTestFlip.secondary.climatology?.artifactSha256).toBe(before.secondary.climatology?.artifactSha256)
    // Control: the hash is genuinely label-sensitive, so the invariance above is not vacuous.
    expect(afterTrainFlip.primary.artifactSha256).not.toBe(before.primary.artifactSha256)
  })

  it('separates the primary comparator from the diagnostic secondaries', () => {
    const fitted = fitScientificBaselines({ rows: trainRows })

    expect(fitted.primary.baselineId).toBe('babl-strata-v1')
    expect(fitted.primary.role).toBe('primary')
    expect(fitted.secondary.persistence.role).toBe('secondary_diagnostic')
    expect(fitted.secondary.climatology?.role).toBe('secondary_diagnostic')
    expect(fitted.primary.studyContractId).toBe(STUDY.studyContractId)
    expect(fitted.primary.studyContractSha256).toBe(STUDY.studyContractSha256)
  })

  it('rejects a mixed-study fold and an empty train fold', () => {
    const mixed = [...trainRows, { ...trainRows[0], studyContractId: 'study-2' }]

    expect(() => fitBAblStrataBaseline({ rows: mixed })).toThrow(/mixed study contracts/)
    expect(() => fitPersistenceBaseline({ rows: mixed })).toThrow(/mixed study contracts/)
    expect(() => fitClimatologyBaseline({ rows: mixed })).toThrow(/mixed study contracts/)
    expect(() => fitBAblStrataBaseline({ rows: [] })).toThrow(/0 training rows/)
  })
})
