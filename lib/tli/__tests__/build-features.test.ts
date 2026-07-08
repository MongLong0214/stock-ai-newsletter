import { describe, expect, it } from 'vitest'
import {
  buildFeatureVector,
  FEATURE_NAMES,
  type FeatureInputs,
} from '@/lib/tli/features/build-features'

const completeInput = {
  interestRaw: [10, 12, 14, 16, 18, 20, 22, 18, 21, 24, 27, 30, 33, 36],
  anchorScaled: [22, 23, 24, 25, 26, 27, 28],
  crossSectionalAnchorMeans: Array.from({ length: 50 }, (_, index) => index),
  newsCounts: [1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10],
  basketStocks: [
    {
      symbol: '005930',
      closeAtLookback: 100,
      closeAtBase: 110,
      recentVolumes: [120, 130, 140, 150, 160],
      baselineVolumes: [
        100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
        100, 100, 100, 100, 100, 120, 130, 140, 150, 160,
      ],
    },
    {
      symbol: '000660',
      closeAtLookback: 200,
      closeAtBase: 210,
      recentVolumes: [220, 230, 240, 250, 260],
      baselineVolumes: [
        200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
        200, 200, 200, 200, 200, 220, 230, 240, 250, 260,
      ],
    },
  ],
  kospiCloseAtLookback: 1000,
  kospiCloseAtBase: 1020,
  daysSinceSpike: 5,
  completedEpisodePeakDays: [8, 10, 12],
  bablPhaseSignal: 1,
} satisfies FeatureInputs

describe('T-201 feature builder', () => {
  it('returns the fixed 13-feature schema in PRD order', () => {
    expect(FEATURE_NAMES).toEqual([
      'interest_slope_7d',
      'interest_level_pct',
      'interest_accel',
      'dvi_7d',
      'news_volume_7d',
      'news_momentum',
      'basket_return_5d',
      'basket_volume_ratio',
      'episode_progress',
      'market_regime',
      'babl_phase_signal',
      'interest_return_10d',
      'interest_drawdown_20d',
    ])
  })

  it('computes the PRD G.1 formulas for a hand-calculated fixture', () => {
    const vector = buildFeatureVector(completeInput)

    expect(vector.values).toHaveLength(13)
    expect(vector.missingFlags).toEqual(Array.from({ length: 13 }, () => false))
    expect(vector.abstain).toBe(false)
    expect(vector.values[0]).toBeCloseTo(3 / 27, 6)
    expect(vector.values[1]).toBeCloseTo(0.5, 6)
    expect(vector.values[2]).toBeCloseTo(3 / 33 - 3 / 27, 6)
    expect(vector.values[3]).toBeCloseTo(1, 6)
    expect(vector.values[4]).toBeCloseTo(Math.log(1 + 49) / Math.log(1 + 64.3), 6)
    expect(vector.values[5]).toBeCloseTo((49 - 16) / 16, 6)
    expect(vector.values[6]).toBeCloseTo(((0.1 + 0.05) / 2) - 0.02, 6)
    // N7 (G.1 ratio-of-means): pooled recent mean (190) / pooled baseline mean (160), not the
    // average of each stock's own ratio.
    expect(vector.values[7]).toBeCloseTo(190 / 160, 6)
    expect(vector.values[8]).toBeCloseTo(0.5, 6)
    expect(vector.values[9]).toBe(1)
    expect(vector.values[10]).toBe(1)
    expect(vector.values[11]).toBeCloseTo(Math.log(34 / 15), 6)
    expect(vector.values[12]).toBe(0)
  })

  it('abstains when interest history is shorter than 7 days', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      interestRaw: [10, 11, 12],
    })

    expect(vector.abstain).toBe(true)
    expect(vector.abstainReasons).toContain('interest_history_lt_7')
    expect(vector.missingFlags[0]).toBe(true)
  })

  it('marks missing features and abstains when more than 3 features are missing', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      anchorScaled: [],
      crossSectionalAnchorMeans: [],
      newsCounts: [],
      basketStocks: [],
      kospiCloseAtBase: null,
      kospiCloseAtLookback: null,
      daysSinceSpike: null,
      completedEpisodePeakDays: [],
    })

    expect(vector.abstain).toBe(true)
    expect(vector.abstainReasons).toContain('missing_features_gt_3')
    expect(vector.missingFlags.filter(Boolean).length).toBeGreaterThan(3)
  })

  it('N1: keeps every value finite when non-abstaining despite missing features', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      kospiCloseAtLookback: null,
      kospiCloseAtBase: null,
    })

    expect(vector.abstain).toBe(false)
    expect(vector.values.every((value) => Number.isFinite(value))).toBe(true)
    expect(vector.missingFlags[6]).toBe(true)
    expect(vector.missingFlags[9]).toBe(true)
    expect(vector.missingFlags.filter(Boolean).length).toBeLessThanOrEqual(3)
  })

  it('marks a missing B-abl phase snapshot as missing without abstaining by itself', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      bablPhaseSignal: null,
    })

    expect(vector.abstain).toBe(false)
    expect(vector.values[10]).toBe(0)
    expect(vector.missingFlags[10]).toBe(true)
    expect(vector.abstainReasons).toEqual([])
  })

  it('marks interest_return_10d missing when the past window has no positive mean', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      interestRaw: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3],
    })

    expect(vector.abstain).toBe(false)
    expect(vector.values[11]).toBe(0)
    expect(vector.missingFlags[11]).toBe(true)
  })

  it('computes interest_drawdown_20d from the recent peak and current raw value', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      interestRaw: [10, 12, 14, 16, 18, 50, 44, 40, 38, 36, 34, 32, 30, 25],
    })

    expect(vector.values[12]).toBeCloseTo(0.5, 6)
    expect(vector.missingFlags[12]).toBe(false)
  })

  it('marks interest_drawdown_20d missing when fewer than 10 finite raw values exist', () => {
    const vector = buildFeatureVector({
      ...completeInput,
      interestRaw: [10, 11, 12, 13, 14, 15, 16, 17, 18],
    })

    expect(vector.abstain).toBe(false)
    expect(vector.values[12]).toBe(0)
    expect(vector.missingFlags[12]).toBe(true)
  })
})
