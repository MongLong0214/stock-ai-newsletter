import { describe, expect, it } from 'vitest'

import { OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
import parity from '@/scripts/stock-picks/fixtures/composite-utility-v1-parity.json'
import { FROZEN_COMPOSITE_UTILITY_MODEL } from '@/scripts/stock-picks/production-strategy'
import { normalizeUtilityScore, scoreUtilityModel, UTILITY_SCORE_VERSION, validateUtilityModel,
  type UtilityModelArtifact, type UtilityScoreNormalization, type UtilityTreeNode } from '@/scripts/stock-picks/utility-model'

const leaf = (value: number): UtilityTreeNode => ({ isLeaf: true, value, featureIdx: 0,
  numThreshold: 0, missingGoLeft: false, left: 0, right: 0 })
const normalization = (): UtilityScoreNormalization => ({
  version: UTILITY_SCORE_VERSION, mean: 0.4, standardDeviation: 0.1,
  center: 50, pointsPerStandardDeviation: 20, referencePanels: 421, referenceRows: 506470,
  referenceThrough: '2026-09-29', referenceLastSignal: '2026-09-18', source: 'kis',
  weighting: 'equal signal date, strict matured training rows', fitInputSha256: 'a'.repeat(64),
})
const model = (tree: readonly UtilityTreeNode[] = [leaf(0)]): UtilityModelArtifact => ({
  schemaVersion: 2, modelVersion: 'composite-utility-v2', trainedLabelsThrough: '2026-09-29',
  observedInputVersion: OBSERVED_INPUT_VERSION,
  featureNames: OBSERVED_INPUT_NAMES, baselinePrediction: 0.4,
  normalization: normalization(),
  trees: [tree, ...Array.from({ length: 99 }, () => [leaf(0)])],
})
const inputs = (): (number | null)[] => Array(50).fill(null)

describe('native HGB utility inference', () => {
  it('matches the independent native sklearn vectors including observed missing inputs', () => {
    expect(parity.featureNames).toEqual(OBSERVED_INPUT_NAMES)
    expect(parity.cases.some((c) => c.inputs.includes(null))).toBe(true)
    for (const witness of parity.cases) {
      const result = scoreUtilityModel(FROZEN_COMPOSITE_UTILITY_MODEL, witness.inputs)
      expect(result.utility, witness.id).toBeCloseTo(Math.min(1, Math.max(0, witness.prediction)), 14)
      expect(result.score, witness.id).toBe(witness.overallScore)
      expect(scoreUtilityModel(FROZEN_COMPOSITE_UTILITY_MODEL,
        witness.inputs.map((v) => v === null ? Number.NaN : v))).toEqual(result)
    }
  })

  it('uses inclusive numeric splits and the recorded native missing direction', () => {
    const artifact = model([{ ...leaf(0), isLeaf: false, featureIdx: 0, numThreshold: 2,
      missingGoLeft: true, left: 1, right: 2 }, leaf(0.125), leaf(-0.225)])
    for (const value of [null, Number.NaN, 2, 1.999999999]) {
      const x = inputs(); x[0] = value
      expect(scoreUtilityModel(artifact, x)).toEqual({ utility: 0.525, score: 75 })
    }
    const x = inputs(); x[0] = 2.000000001
    expect(scoreUtilityModel(artifact, x).utility).toBeCloseTo(0.175, 15)
    expect(scoreUtilityModel(artifact, x).score).toBe(5)
    const other = { ...artifact, trees: [[{ ...artifact.trees[0]![0]!, missingGoLeft: false }, ...artifact.trees[0]!.slice(1)], ...artifact.trees.slice(1)] }
    expect(scoreUtilityModel(other, inputs()).score).toBe(5)
  })

  it('sums already weighted leaves once and preserves clipped utility while using the fixed reference scale', () => {
    const artifact = { ...model(), baselinePrediction: 0.12,
      trees: Array.from({ length: 100 }, () => [leaf(0.002)]) }
    const result = scoreUtilityModel(artifact, inputs())
    expect(result.utility).toBeCloseTo(0.32, 14)
    expect(result.score).toBe(34)
    expect(scoreUtilityModel({ ...model(), baselinePrediction: -0.1 }, inputs())).toEqual({ utility: 0, score: 0 })
    expect(scoreUtilityModel({ ...model(), baselinePrediction: 1.1 }, inputs())).toEqual({ utility: 1, score: 100 })
  })

  it('maps the fixed training mean to 50, one standard deviation to 70 or 30, and clamps extremes', () => {
    const reference = { ...normalization(), mean: 0.5, standardDeviation: 0.125 }
    expect(normalizeUtilityScore(reference, 0.5)).toBe(50)
    expect(normalizeUtilityScore(reference, 0.625)).toBe(70)
    expect(normalizeUtilityScore(reference, 0.375)).toBe(30)
    expect(normalizeUtilityScore(reference, -1)).toBe(0)
    expect(normalizeUtilityScore(reference, 2)).toBe(100)
    // Binary-exact inputs make the half-point witness independent of floating-point noise.
    const roundReference = { ...reference, standardDeviation: 0.3125 }
    expect(normalizeUtilityScore(roundReference, 0.5078125)).toBe(51)
    expect(normalizeUtilityScore(roundReference, 0.5078125 - 1e-10)).toBe(50)
  })

  it('rejects absent, malformed, incompatible or future training reference metadata', () => {
    const invalidReferences: unknown[] = [
      undefined, null, {},
      { ...normalization(), version: 'utility-reference-z10-v1' },
      { ...normalization(), mean: Number.NaN },
      { ...normalization(), mean: 1.01 },
      { ...normalization(), standardDeviation: 0 },
      { ...normalization(), standardDeviation: Number.POSITIVE_INFINITY },
      { ...normalization(), standardDeviation: -0.1 },
      { ...normalization(), standardDeviation: 0.501 },
      { ...normalization(), center: 70 },
      { ...normalization(), pointsPerStandardDeviation: 15 },
      { ...normalization(), referencePanels: 0 },
      { ...normalization(), referenceRows: 420 },
      { ...normalization(), referenceThrough: '2026-09-31' },
      { ...normalization(), referenceThrough: '2026-09-30' },
      { ...normalization(), referenceLastSignal: '2026-09-29' },
      { ...normalization(), referenceLastSignal: '2026-09-30' },
      { ...normalization(), source: 'naver' },
      { ...normalization(), weighting: 'equal row' },
      { ...normalization(), fitInputSha256: 'missing' },
    ]
    for (const invalid of invalidReferences) {
      expect(() => validateUtilityModel({ ...model(), normalization: invalid } as UtilityModelArtifact))
        .toThrow(/표준화/)
    }
    expect(() => validateUtilityModel({ ...model(), schemaVersion: 1 } as unknown as UtilityModelArtifact)).toThrow(/모델 계약/)
    expect(() => validateUtilityModel({ ...model(), modelVersion: 'composite-utility-v1' })).toThrow(/모델 계약/)
    expect(() => normalizeUtilityScore(normalization(), Number.NaN)).toThrow(/추론 실패/)
  })

  it('fails closed for incompatible features, disconnected or cyclic models and unavailable inputs', () => {
    expect(() => validateUtilityModel({ ...model(), featureNames: [...OBSERVED_INPUT_NAMES].reverse() })).toThrow(/모델 계약/)
    expect(() => validateUtilityModel({ ...model(), observedInputVersion: 'other-version' })).toThrow(/모델 계약/)
    expect(() => validateUtilityModel(model([leaf(0), leaf(0)]))).toThrow(/미연결/)
    expect(() => validateUtilityModel(model([{ ...leaf(0), isLeaf: false, left: 0, right: 0 }]))).toThrow(/연결/)
    expect(() => scoreUtilityModel(model(), [1])).toThrow(/피처 계약/)
    expect(() => scoreUtilityModel(model(), new Array(50))).toThrow(/피처 계약/)
    expect(() => scoreUtilityModel(model(), [Number.POSITIVE_INFINITY, ...inputs().slice(1)])).toThrow(/피처 계약/)
    expect(() => scoreUtilityModel({ ...model(), trees: [] }, inputs())).toThrow(/모델 계약/)
  })
})
