import { describe, expect, it } from 'vitest'
import { FEATURE_NAMES } from '../../../lib/tli/features/build-features'
import type { EvalPredictionRow } from '../../../lib/tli/eval/types'
import type { BaselineFeatureRow } from '../../../lib/tli/model/baselines'
import {
  buildFeatureLivenessAudit,
  buildReliabilityCurve,
  computeEceVsSampleSize,
} from '../ops/m1-calibration-diagnostic'

const predictionRow = (index: number, probability: number, y: boolean): EvalPredictionRow => ({
  id: `theme-${index}|2026-07-01`,
  themeId: `theme-${index}`,
  baseDate: '2026-07-01',
  probability,
  y,
})

const featureRow = (
  index: number,
  values: readonly number[],
  missingFlags: readonly boolean[],
): BaselineFeatureRow => ({
  themeId: `theme-${index}`,
  baseDate: '2026-07-01',
  values,
  missingFlags,
  abstain: false,
  y: index % 2 === 0,
})

describe('m1 calibration diagnostic pure functions', () => {
  it('reports sample-limited ECE behavior when small samples are noisy but the full set is calibrated', () => {
    const rows = Array.from({ length: 100 }, (_, index) => predictionRow(index, 0.5, index < 50))

    const result = computeEceVsSampleSize(rows, {
      sampleSizes: [10],
      iterations: 20,
      seed: 11,
      eceBinCount: 5,
      eceMinBinSize: 1,
    })

    expect(result.verdict).toBe('sample_limited')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].sampleLabel).toBe('10')
    expect(result.rows[0].meanEce).toBeGreaterThan(0)
    expect(result.rows[1]).toMatchObject({
      sampleLabel: 'full',
      sampleSize: 100,
      meanEce: 0,
      p025Ece: 0,
      p975Ece: 0,
    })
  })

  it('bins reliability curve rows into fixed-width probability buckets', () => {
    const rows = [
      predictionRow(1, 0.05, false),
      predictionRow(2, 0.15, true),
      predictionRow(3, 0.15, false),
      predictionRow(4, 0.95, true),
    ]

    const result = buildReliabilityCurve(rows)

    expect(result.monotonicObservedRate).toBe(true)
    expect(result.largestGap).toEqual({
      binLabel: '[0.1,0.2)',
      gap: -0.35,
      absoluteGap: 0.35,
    })
    expect(result.bins[0]).toMatchObject({
      binLabel: '[0.0,0.1)',
      count: 1,
      meanPredictedProbability: 0.05,
      observedPositiveRate: 0,
      gap: 0.05,
    })
    expect(result.bins[1]).toMatchObject({
      binLabel: '[0.1,0.2)',
      count: 2,
      meanPredictedProbability: 0.15,
      observedPositiveRate: 0.5,
      gap: -0.35,
    })
    expect(result.bins[9].binLabel).toBe('[0.9,1.0]')
    expect(result.bins[9].count).toBe(1)
    expect(result.bins[9].meanPredictedProbability).toBe(0.95)
    expect(result.bins[9].observedPositiveRate).toBe(1)
    expect(result.bins[9].gap).toBeCloseTo(-0.05, 6)
  })

  it('flags missing-heavy and zero-variance features as dead', () => {
    const rows = Array.from({ length: 4 }, (_, rowIndex) => {
      const values = FEATURE_NAMES.map((_, featureIndex) => {
        if (featureIndex === 1) return 1
        return rowIndex + featureIndex
      })
      const missingFlags = FEATURE_NAMES.map((_, featureIndex) => featureIndex === 0 && rowIndex < 3)
      return featureRow(rowIndex, values, missingFlags)
    })

    const audit = buildFeatureLivenessAudit(rows)

    expect(audit.deadFeatureCount).toBe(2)
    expect(audit.verdict).toBe('dead_features_present')
    expect(audit.features[0]).toMatchObject({
      featureName: FEATURE_NAMES[0],
      missingRate: 0.75,
      dead: true,
    })
    expect(audit.features[0].deadReasons).toContain('missing_rate_gt_0.5')
    expect(audit.features.find((feature) => feature.featureName === FEATURE_NAMES[1])).toMatchObject({
      variance: 0,
      dead: true,
      deadReasons: ['variance_lt_1e-6'],
    })
  })
})
