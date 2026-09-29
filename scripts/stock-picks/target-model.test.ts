import { describe, expect, it } from 'vitest'

import frozenModel from '@/scripts/stock-picks/models/bullish-target-v3.json'
import goldenSamples from '@/scripts/stock-picks/fixtures/target-model-golden.json'

import type { StockFeatureVector } from '@/scripts/stock-picks/features'
import {
  TARGET_MODEL_FEATURE_NAMES,
  scoreTargetModel,
  targetModelFeatures,
  type TargetLogisticModel,
  type TargetModelArtifact,
} from '@/scripts/stock-picks/target-model'

const feature = (overrides: Partial<StockFeatureVector> = {}): StockFeatureVector => ({
  symbol: 'KOSPI:005930', simDate: '2026-09-28', open: 100, high: 120, low: 80, close: 110,
  volume: 100, averageTurnover20: 500_000_000, rsi14: 60, macdHistogram: 2.2,
  sma20: 105, sma60: 100, ema20: 105, sma20Slope5: 0.02, sma20DistancePercent: 4,
  atrPercent14: 3, atrPercentile60: 40, adx14: 25, adx14Previous: 24, adx14Change: 1,
  obvSlope20: 20, volumeRatio20: 2, volumePercentile60: 80, position52w: 0.7,
  position52wObservations: 252, position52wFullWindow: true, consecutiveUpDays: 2,
  trendR2_20: 0.8, trendSlope20: -0.01, trendR2_20Previous: 0.7, trendR2_20Change: 0.1,
  trendR2_60: 0.6, trendSlope60: 0.01, distanceFromHigh60: -5,
  gapFromPreviousClosePercent: 1, goldenCrossAge: null, bullishCandle: true, ...overrides,
})

const model = (overrides: Partial<TargetLogisticModel> = {}): TargetLogisticModel => ({
  featureNames: TARGET_MODEL_FEATURE_NAMES,
  lower: TARGET_MODEL_FEATURE_NAMES.map(() => -1_000),
  upper: TARGET_MODEL_FEATURE_NAMES.map(() => 1_000),
  mean: TARGET_MODEL_FEATURE_NAMES.map(() => 0),
  scale: TARGET_MODEL_FEATURE_NAMES.map(() => 1),
  coefficient: TARGET_MODEL_FEATURE_NAMES.map(() => 0), intercept: 0, ...overrides,
})

const direct = (joint = model()): TargetModelArtifact => ({ kind: 'directJoint', models: { joint } })

describe('target model feature extraction', () => {
  it('preserves units and feature order including log and candle transforms', () => {
    const expected = [3, 60, 2, 4, 2, -1, 0.8, 25, Math.log(3), 80, 1, 10, 0.75, -5, 0.7, Math.log(6)]
    const values = targetModelFeatures(feature())!
    expect(values).toHaveLength(expected.length)
    values.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 12))
    expect(targetModelFeatures(feature({ open: 110, high: 110, low: 110 }))![12]).toBe(0.5)
  })

  it.each([null, undefined, NaN, Infinity, -Infinity])('rejects missing or nonfinite required values: %s', (value) => {
    for (const key of ['atrPercent14', 'rsi14', 'macdHistogram', 'close', 'open', 'high', 'low',
      'sma20DistancePercent', 'sma20Slope5', 'trendSlope20', 'trendR2_20', 'adx14', 'volumeRatio20',
      'volumePercentile60', 'gapFromPreviousClosePercent', 'distanceFromHigh60', 'position52w',
      'averageTurnover20'] as const) {
      expect(targetModelFeatures(feature({ [key]: value }))).toBeNull()
      expect(scoreTargetModel(feature({ [key]: value }), direct())).toBeNull()
    }
  })

  it('rejects invalid transform domains and overflow instead of substituting defaults', () => {
    for (const change of [{ open: 0 }, { close: 0 }, { high: 79 }, { volumeRatio20: -0.5 },
      { averageTurnover20: -1 }, { open: Number.MIN_VALUE }]) {
      expect(targetModelFeatures(feature(change))).toBeNull()
    }
    expect(targetModelFeatures(feature({ goldenCrossAge: null, ema20: null }))).not.toBeNull()
  })
})

describe('target model scoring', () => {
  it('clips before standardization and scores a deterministic golden sample', () => {
    const joint = model({
      lower: [1, ...model().lower.slice(1)], upper: [2, ...model().upper.slice(1)],
      mean: [1, ...model().mean.slice(1)], scale: [2, ...model().scale.slice(1)],
      coefficient: [4, ...model().coefficient.slice(1)], intercept: -1,
    })
    expect(scoreTargetModel(feature(), direct(joint))).toBeCloseTo(0.7310585786300049, 14)
    expect(scoreTargetModel(feature({ atrPercent14: 100 }), direct(joint)))
      .toBe(scoreTargetModel(feature(), direct(joint)))
    expect(scoreTargetModel(feature({ atrPercent14: 0 }), direct(joint)))
      .toBeCloseTo(0.2689414213699951, 14)
  })

  it('uses the exact conditional chain and each head own preprocessing', () => {
    const artifact: TargetModelArtifact = {
      kind: 'conditionalJoint', models: { entryBullish: model({ intercept: Math.log(3) }),
      touchGivenBullish: model({ mean: [3, ...model().mean.slice(1)],
        coefficient: [1, ...model().coefficient.slice(1)] }) },
    }
    expect(scoreTargetModel(feature(), artifact)).toBeCloseTo(0.375, 14)
  })

  it('handles both coefficient signs and extreme logistic margins without overflow', () => {
    expect(scoreTargetModel(feature(), direct(model({ coefficient: [-1, ...model().coefficient.slice(1)] }))))
      .toBeCloseTo(0.04742587317756679, 14)
    expect(scoreTargetModel(feature(), direct(model({ intercept: 1_000 })))).toBe(1)
    expect(scoreTargetModel(feature(), direct(model({ intercept: -1_000 })))).toBe(0)
  })

  it.each([
    { featureNames: [...TARGET_MODEL_FEATURE_NAMES].reverse() }, { featureNames: [] },
    { lower: [] }, { upper: [] }, { mean: [] }, { scale: [] }, { coefficient: [] },
    { scale: [0, ...model().scale.slice(1)] }, { scale: [-1, ...model().scale.slice(1)] },
    { coefficient: [NaN, ...model().coefficient.slice(1)] }, { intercept: Infinity },
    { lower: [2_000, ...model().lower.slice(1)] },
  ])('rejects malformed artifact arrays, order, bounds, or scale: %j', (overrides) => {
    expect(() => scoreTargetModel(feature(), direct(model(overrides)))).toThrow(/Target model/)
  })

  it('rejects unknown kinds and a malformed conditional head', () => {
    expect(() => scoreTargetModel(feature(), { kind: 'unknown' } as unknown as TargetModelArtifact))
      .toThrow(/Unsupported/)
    expect(() => scoreTargetModel(feature(), {
      kind: 'conditionalJoint', models: { entryBullish: model(), touchGivenBullish: model({ scale: [] }) },
    })).toThrow(/scale/)
  })
})

// Generated independently by Python/scikit-learn on real stored OHLCV features.
// Protects feature units, clipping, preprocessing, coefficient order and runtime inference.

it('matches the offline Python model on real market feature vectors', () => {
  for (const sample of goldenSamples) {
    expect(scoreTargetModel(sample.feature, frozenModel as TargetModelArtifact)).toBeCloseTo(sample.score, 12)
  }
})
