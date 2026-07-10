import { describe, expect, it } from 'vitest'

import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json-v1'
import {
  fitTwoFeatureLogistic,
  TWO_FEATURE_MIN_OOF_CLASS_COUNT,
  type TwoFeatureLogisticTrainRow,
} from '@/lib/tli/model/two-feature-logistic'
import {
  buildTwoFeatureFixtureRows,
  TWO_FEATURE_FIXTURE_PREDICT_ROWS,
  TWO_FEATURE_FIXTURE_STUDY_ID,
  TWO_FEATURE_FIXTURE_STUDY_SHA256,
} from '@/scripts/tli/learn/__tests__/two-feature-logistic.fixture'

const fitGolden = () => fitTwoFeatureLogistic({
  trainRows: buildTwoFeatureFixtureRows(),
  studyContractId: TWO_FEATURE_FIXTURE_STUDY_ID,
  studyContractSha256: TWO_FEATURE_FIXTURE_STUDY_SHA256,
})

const expectComputed = <T extends { status: 'computed' | 'not_computed' }>(result: T): Extract<T, { status: 'computed' }> => {
  if (result.status !== 'computed') throw new Error(`expected computed, got ${JSON.stringify(result)}`)
  return result as Extract<T, { status: 'computed' }>
}

describe('two-feature logistic diagnostic baseline', () => {
  it('fits a golden train-only artifact honouring the same preprocess/C/Platt contract', () => {
    const { artifact } = expectComputed(fitGolden())

    expect(artifact.baselineId).toBe('logistic-two-feature-v1')
    expect(artifact.role).toBe('secondary_diagnostic')
    expect(artifact.featureNames).toEqual(['interest_slope_7d', 'news_momentum'])
    expect(artifact.studyContractId).toBe(TWO_FEATURE_FIXTURE_STUDY_ID)
    expect(artifact.studyContractSha256).toBe(TWO_FEATURE_FIXTURE_STUDY_SHA256)

    // train-only median/MAD over the two features
    expect(artifact.scaler.median[0]).toBeCloseTo(-0.013706, 12)
    expect(artifact.scaler.median[1]).toBeCloseTo(1.417744, 12)
    expect(artifact.scaler.mad[0]).toBeCloseTo(0.532714, 12)
    expect(artifact.scaler.mad[1]).toBeCloseTo(0.711173, 12)

    // pre-calibration inner-OOF Brier selects C=1 (minimum mean Brier, smaller-C tiebreak)
    expect(artifact.selectedC).toBe(1)
    expect(artifact.candidateScores.map((score) => score.c)).toEqual([0.01, 0.1, 1, 10])
    const selected = artifact.candidateScores.find((score) => score.c === artifact.selectedC)
    expect(selected).toBeDefined()
    const minMeanBrier = Math.min(...artifact.candidateScores.map((score) => score.meanBrier))
    expect(selected?.meanBrier).toBe(minMeanBrier)
    expect(selected?.meanBrier).toBeCloseTo(0.17966750746954419, 12)

    // L2 base estimator: [scaled_slope, scaled_news, flag_slope, flag_news] + unpenalised intercept
    expect(artifact.coefficients.weights).toHaveLength(4)
    expect(artifact.coefficients.intercept).toBeCloseTo(0.28293683084256155, 10)
    expect(artifact.coefficients.weights[0]).toBeCloseTo(1.0789781625117196, 10)
    expect(artifact.coefficients.weights[1]).toBeCloseTo(0.5254187921925892, 10)
    expect(artifact.coefficients.weights[2]).toBeCloseTo(0.07517785053664876, 10)
    expect(artifact.coefficients.weights[3]).toBeCloseTo(-0.08033812419652722, 10)

    // time-blocked origin-balanced OOF Platt
    expect(artifact.calibrator.a).toBeCloseTo(-1.1020271814910751, 10)
    expect(artifact.calibrator.b).toBeCloseTo(-0.25954886908157887, 10)

    expect(artifact.trainRowCount).toBe(192)
    expect(artifact.trainOrigins).toHaveLength(16)
    expect(artifact.oofRowCount).toBe(96)
    expect(artifact.oofPositiveCount).toBe(55)
    expect(artifact.oofNegativeCount).toBe(41)

    // pure-string inner split hash is fully deterministic
    expect(artifact.innerOofSplitOriginsSha256)
      .toBe('f5323af9860b445a6f4f9f81bcab1793238a7e363d7f2ddb4eb15cc3588bedd6')
    // artifact hash binds the whole fit and is self-consistent
    const { artifactSha256, ...body } = artifact
    expect(canonicalJsonV1Sha256(body)).toBe(artifactSha256)
    expect(artifactSha256).toBe('5a14cbb4152a42d051b80eebcada93abaf0628b97a910dacac0fa97cc6ad77c1')
  })

  it('scores probabilities inside (0,1) that track the feature signal and impute missing to the median', () => {
    const result = expectComputed(fitGolden())
    const probabilities = TWO_FEATURE_FIXTURE_PREDICT_ROWS.map((row) => result.predict(row))
    const [high, low, missing] = probabilities

    for (const probability of probabilities) {
      expect(probability).toBeGreaterThan(0)
      expect(probability).toBeLessThan(1)
    }
    expect(high).toBeGreaterThan(missing)
    expect(missing).toBeGreaterThan(low)
    expect(high).toBeCloseTo(0.9767115517806543, 10)
    expect(low).toBeCloseTo(0.07728521972045402, 10)
    expect(missing).toBeCloseTo(0.6377625698933426, 10)
  })

  it('is deterministic across repeated fits', () => {
    const first = expectComputed(fitGolden())
    const second = expectComputed(fitGolden())
    expect(second.artifact.artifactSha256).toBe(first.artifact.artifactSha256)
  })

  it('degrades to not_computed when there are too few train origins', () => {
    const rows = buildTwoFeatureFixtureRows().filter((row) => row.originDate <= '2026-03-02')
    const result = fitTwoFeatureLogistic({
      trainRows: rows,
      studyContractId: TWO_FEATURE_FIXTURE_STUDY_ID,
      studyContractSha256: TWO_FEATURE_FIXTURE_STUDY_SHA256,
    })
    expect(result).toEqual({ status: 'not_computed', reason: 'insufficient_train_origins' })
  })

  it('degrades to not_computed when the OOF class floor is not met', () => {
    // Enough origins for a valid inner split, but each origin has a single balanced-but-tiny slice
    // so the OOF cannot reach the 30-per-class floor the candidate contract requires.
    const rows: TwoFeatureLogisticTrainRow[] = []
    for (let origin = 0; origin < 16; origin += 1) {
      const originDate = new Date(Date.UTC(2026, 0, 5 + origin * 7)).toISOString().slice(0, 10)
      for (let theme = 0; theme < 2; theme += 1) {
        rows.push({
          themeId: `theme-${theme}`,
          originDate,
          interestSlope7d: theme === 0 ? 0.5 : -0.5,
          newsMomentum: theme === 0 ? 2 : 0.5,
          y: theme === 0,
        })
      }
    }
    const result = fitTwoFeatureLogistic({
      trainRows: rows,
      studyContractId: TWO_FEATURE_FIXTURE_STUDY_ID,
      studyContractSha256: TWO_FEATURE_FIXTURE_STUDY_SHA256,
    })
    expect(result.status).toBe('not_computed')
    if (result.status === 'not_computed') expect(result.reason).toBe('oof_class_floor')
    // sanity: the tiny fixture indeed cannot satisfy the class floor
    expect(rows.length).toBeLessThan(TWO_FEATURE_MIN_OOF_CLASS_COUNT * 2)
  })
})
