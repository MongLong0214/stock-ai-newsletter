import { describe, expect, it } from 'vitest'

import { OBSERVED_FLOW_INPUT_NAMES, OBSERVED_FLOW_INPUT_VERSION, OBSERVED_INPUT_NAMES, OBSERVED_INPUT_VERSION } from '@/scripts/stock-picks/observed-inputs'
import parity from '@/scripts/stock-picks/fixtures/composite-utility-v1-parity.json'
import utilityArtifact from '@/scripts/stock-picks/models/composite-utility-v1.json'
import returnParity from '@/scripts/stock-picks/fixtures/composite-return-v6-parity.json'
import returnV8Parity from '@/scripts/stock-picks/fixtures/composite-return-v8-parity.json'
import returnV9Parity from '@/scripts/stock-picks/fixtures/composite-return-v9-parity.json'
import returnV6Artifact from '@/scripts/stock-picks/models/composite-return-v6.json'
import returnV8Artifact from '@/scripts/stock-picks/models/composite-return-v8.json'
import { FROZEN_COMPOSITE_RETURN_MODEL } from '@/scripts/stock-picks/production-strategy'
import { attributeUtilityModel, normalizeUtilityScore, scoreUtilityHitHead, scoreUtilityModel, RETURN_SCORE_VERSION, UTILITY_SCORE_VERSION, validateUtilityModel,
  type UtilityModelArtifact, type LegacyUtilityModelArtifact, type CompositeUtilityModelArtifact, type CompositeReturnModelArtifact,
  type CompositeReturnHitModelArtifact, type UtilityScoreNormalization, type UtilityTreeNode } from '@/scripts/stock-picks/utility-model'

const frozenUtilityModel = validateUtilityModel(utilityArtifact as UtilityModelArtifact)
const frozenReturnV6Model = validateUtilityModel(returnV6Artifact as UtilityModelArtifact)
const frozenReturnV8Model = validateUtilityModel(returnV8Artifact as UtilityModelArtifact)

const leaf = (value: number): UtilityTreeNode => ({ isLeaf: true, value, featureIdx: 0,
  numThreshold: 0, missingGoLeft: false, left: 0, right: 0 })
const normalization = (): UtilityScoreNormalization => ({
  version: UTILITY_SCORE_VERSION, mean: 0.4, standardDeviation: 0.1,
  center: 50, oneStandardDeviationScore: 70, tailCurvature: 5.25, referencePanels: 421, referenceRows: 506470,
  referenceThrough: '2026-09-29', referenceLastSignal: '2026-09-18', source: 'kis',
  weighting: 'equal signal date, strict matured training rows', fitInputSha256: 'a'.repeat(64),
})
const model = (tree: readonly UtilityTreeNode[] = [leaf(0)]): LegacyUtilityModelArtifact => ({
  schemaVersion: 3, modelVersion: 'composite-utility-v3', trainedLabelsThrough: '2026-09-29',
  observedInputVersion: OBSERVED_INPUT_VERSION,
  featureNames: OBSERVED_INPUT_NAMES, baselinePrediction: 0.4,
  normalization: normalization(),
  trees: [tree, ...Array.from({ length: 99 }, () => [leaf(0)])],
})
const inputs = (): (number | null)[] => Array(50).fill(null)

describe('native HGB utility inference', () => {
  const returnModel = (): CompositeReturnModelArtifact => ({
    schemaVersion: 5, modelVersion: 'composite-return-v6',
    trainedLabelsThrough: model().trainedLabelsThrough, observedInputVersion: OBSERVED_INPUT_VERSION,
    featureNames: OBSERVED_INPUT_NAMES,
    normalization: { ...normalization(), version: RETURN_SCORE_VERSION, mean: 0, standardDeviation: .01 },
    targetDefinition: { version: 'demeaned-tp7-net-v1', formula: 'net-dateMean(net)', horizon: 5,
      takeProfit: .07, cost: 'krx-realistic-v1', demean: 'signal-date strict rows' },
    parameters: { learning_rate: .05 }, leafValuesAlreadyIncludeLearningRate: true,
    baselinePrediction: -.01, trees: Array.from({ length: 200 }, () => [leaf(0)]),
  })
  it('accepts the single 200-tree return predictor and preserves negative and unbounded predictions', () => {
    const artifact = returnModel()
    expect(validateUtilityModel(artifact)).toBe(artifact)
    expect(scoreUtilityModel(artifact, inputs())).toEqual({ utility: -.01, score: 30 })
    expect(scoreUtilityModel({ ...artifact, baselinePrediction: .01 }, inputs())).toEqual({ utility: .01, score: 70 })
    expect(scoreUtilityModel({ ...artifact, baselinePrediction: 1.1 }, inputs()).utility).toBe(1.1)
    expect(normalizeUtilityScore({ ...artifact.normalization, mean: -.01 }, -.01)).toBe(50)
  })
  it('rejects wrong return tree counts, targets, reference bounds and schema/score version mismatches', () => {
    const artifact = returnModel()
    const invalid = [
      { ...artifact, trees: artifact.trees.slice(1) },
      { ...artifact, trees: artifact.trees.slice(0, 100) },
      { ...artifact, trees: [...artifact.trees, [leaf(0)]] },
      { ...artifact, normalization: normalization() },
      { ...artifact, targetDefinition: { ...artifact.targetDefinition, takeProfit: .1 } },
      { ...artifact, targetDefinition: { ...artifact.targetDefinition, version: 'touch-nonloss-v1' } },
      { ...artifact, modelVersion: 'composite-utility-v4' },
      { ...model(), normalization: artifact.normalization },
      { ...composite(), normalization: artifact.normalization },
      { ...model(), trees: artifact.trees },
    ]
    for (const mean of [-.501, .501, NaN]) invalid.push({ ...artifact, normalization: { ...artifact.normalization, mean } })
    for (const standardDeviation of [0, -.01, .501, Infinity]) {
      invalid.push({ ...artifact, normalization: { ...artifact.normalization, standardDeviation } })
    }
    for (const candidate of invalid) expect(() => validateUtilityModel(candidate as UtilityModelArtifact)).toThrow()
    for (const mean of [-.5, .5]) expect(() => validateUtilityModel({ ...artifact,
      normalization: { ...artifact.normalization, mean, standardDeviation: .5 } })).not.toThrow()
  })
  it.each([
    { label: 'v8', artifact: frozenReturnV8Model, fixture: returnV8Parity },
    { label: 'v9 production', artifact: FROZEN_COMPOSITE_RETURN_MODEL, fixture: returnV9Parity },
  ])('decomposes every native $label prediction exactly into per-input path contributions', ({ artifact, fixture }) => {
    for (const witness of fixture.cases) {
      const { bias, contributions } = attributeUtilityModel(artifact, witness.inputs)
      expect(contributions).toHaveLength(OBSERVED_FLOW_INPUT_NAMES.length)
      expect(bias + contributions.reduce((sum, value) => sum + value, 0), witness.id).toBeCloseTo(witness.prediction, 12)
      expect(attributeUtilityModel(artifact,
        witness.inputs.map((v) => v === null ? Number.NaN : v))).toEqual({ bias, contributions })
    }
    expect(() => attributeUtilityModel(frozenUtilityModel, Array(OBSERVED_INPUT_NAMES.length).fill(0))).toThrow('schema 5')
    expect(() => attributeUtilityModel(artifact, Array(OBSERVED_INPUT_NAMES.length).fill(0))).toThrow('관측 피처 계약')
  })
  it('matches the native v9 hit-head log-odds and decomposes them into per-input path contributions', () => {
    expect(returnV9Parity.cases.some((c) => c.hitLogOdds > 0)).toBe(true)
    expect(returnV9Parity.cases.some((c) => c.hitLogOdds < 0)).toBe(true)
    for (const witness of returnV9Parity.cases) {
      const hitLogOdds = scoreUtilityHitHead(FROZEN_COMPOSITE_RETURN_MODEL, witness.inputs)
      expect(hitLogOdds, witness.id).toBeCloseTo(witness.hitLogOdds, 12)
      expect(scoreUtilityHitHead(FROZEN_COMPOSITE_RETURN_MODEL,
        witness.inputs.map((v) => v === null ? Number.NaN : v))).toBe(hitLogOdds)
      const { bias, contributions } = attributeUtilityModel(FROZEN_COMPOSITE_RETURN_MODEL, witness.inputs, 'hit')
      expect(contributions).toHaveLength(OBSERVED_FLOW_INPUT_NAMES.length)
      expect(bias + contributions.reduce((sum, value) => sum + value, 0), witness.id).toBeCloseTo(witness.hitLogOdds, 12)
      // The two heads are separate predictors: the hit head is not the return head on another scale.
      expect(contributions).not.toEqual(attributeUtilityModel(FROZEN_COMPOSITE_RETURN_MODEL, witness.inputs).contributions)
    }
    const flowInputs = Array(OBSERVED_FLOW_INPUT_NAMES.length).fill(0)
    expect(() => scoreUtilityHitHead(frozenReturnV8Model, flowInputs)).toThrow('schema 6')
    expect(() => attributeUtilityModel(frozenReturnV8Model, flowInputs, 'hit')).toThrow('schema 6')
    expect(() => scoreUtilityHitHead(FROZEN_COMPOSITE_RETURN_MODEL, Array(OBSERVED_INPUT_NAMES.length).fill(0))).toThrow('관측 피처 계약')
    expect(() => scoreUtilityHitHead(FROZEN_COMPOSITE_RETURN_MODEL, [Number.POSITIVE_INFINITY, ...flowInputs.slice(1)])).toThrow('관측 피처 계약')
  })
  it.each([
    { label: 'v6', schemaVersion: 5, artifact: frozenReturnV6Model, fixture: returnParity, names: OBSERVED_INPUT_NAMES },
    { label: 'v8', schemaVersion: 5, artifact: frozenReturnV8Model, fixture: returnV8Parity, names: OBSERVED_FLOW_INPUT_NAMES },
    { label: 'v9 production', schemaVersion: 6, artifact: FROZEN_COMPOSITE_RETURN_MODEL, fixture: returnV9Parity, names: OBSERVED_FLOW_INPUT_NAMES },
  ])('matches native $label return vectors without clipping negative predictions', ({ schemaVersion, artifact, fixture, names }) => {
    expect(fixture.schemaVersion).toBe(schemaVersion)
    expect(fixture.scoreVersion).toBe(RETURN_SCORE_VERSION)
    expect(fixture.featureNames).toEqual(names)
    expect(artifact.featureNames).toEqual(names)
    expect(fixture.cases.some((c) => c.prediction < 0)).toBe(true)
    expect(fixture.cases.some((c) => c.inputs.includes(null))).toBe(true)
    for (const witness of fixture.cases) {
      const result = scoreUtilityModel(artifact, witness.inputs)
      expect(result.utility, witness.id).toBeCloseTo(witness.prediction, 14)
      expect(result.score, witness.id).toBe(witness.overallScore)
      expect(scoreUtilityModel(artifact,
        witness.inputs.map((v) => v === null ? Number.NaN : v))).toEqual(result)
    }
  })
  it('binds the 65-input investor-flow contract to v8 and v9 only', () => {
    const v6 = returnModel()
    const v8: CompositeReturnModelArtifact = { ...v6, modelVersion: 'composite-return-v8',
      observedInputVersion: OBSERVED_FLOW_INPUT_VERSION, featureNames: OBSERVED_FLOW_INPUT_NAMES }
    const flowSplit = (artifact: CompositeReturnModelArtifact): CompositeReturnModelArtifact => ({ ...artifact,
      trees: [[{ ...leaf(0), isLeaf: false, featureIdx: 64, numThreshold: 0, missingGoLeft: true, left: 1, right: 2 },
        leaf(-.01), leaf(.01)], ...artifact.trees.slice(1)] })
    expect(validateUtilityModel(v8)).toBe(v8)
    expect(scoreUtilityModel(flowSplit(v8), [...inputs(), ...Array(14).fill(null), 1]).utility).toBeCloseTo(0, 14)
    expect(scoreUtilityModel(flowSplit(v8), [...inputs(), ...Array(15).fill(null)]).utility).toBeCloseTo(-.02, 14)
    expect(() => scoreUtilityModel(v8, inputs())).toThrow('관측 피처 계약')
    expect(() => scoreUtilityModel(v6, [...inputs(), ...Array(15).fill(null)])).toThrow('관측 피처 계약')
    expect(() => validateUtilityModel(flowSplit(v6))).toThrow()
    for (const invalid of [
      { ...v8, featureNames: OBSERVED_INPUT_NAMES },
      { ...v8, observedInputVersion: OBSERVED_INPUT_VERSION },
      { ...v6, featureNames: OBSERVED_FLOW_INPUT_NAMES, observedInputVersion: OBSERVED_FLOW_INPUT_VERSION },
    ]) expect(() => validateUtilityModel(invalid)).toThrow('종합 점수 모델 계약 불일치')
  })
  it('requires the v9 hit head to be a second 200-tree predictor on the same 65 inputs', () => {
    const v8: CompositeReturnModelArtifact = { ...returnModel(), modelVersion: 'composite-return-v8',
      observedInputVersion: OBSERVED_FLOW_INPUT_VERSION, featureNames: OBSERVED_FLOW_INPUT_NAMES }
    const hitSplit = [{ ...leaf(0), isLeaf: false, featureIdx: 64, numThreshold: 0, missingGoLeft: true, left: 1, right: 2 },
      leaf(-.4), leaf(.6)]
    const v9: CompositeReturnHitModelArtifact = { ...v8, schemaVersion: 6, modelVersion: 'composite-return-v9',
      hitTargetDefinition: { version: 'net-positive-d5-v1', formula: 'hit = net > 0', horizon: 5,
        cost: 'krx-realistic-v1', output: 'log-odds' },
      hitParameters: { learning_rate: .05 },
      hitHead: { baselinePrediction: -.3, trees: [hitSplit, ...Array.from({ length: 199 }, () => [leaf(0)])] } }
    const flowInputs = (last: number | null) => [...inputs(), ...Array(14).fill(null), last]
    expect(validateUtilityModel(v9)).toBe(v9)
    // The return head keeps its own score; the hit head returns unclipped log-odds.
    expect(scoreUtilityModel(v9, flowInputs(1))).toEqual({ utility: -.01, score: 30 })
    expect(scoreUtilityHitHead(v9, flowInputs(1))).toBeCloseTo(.3, 14)
    expect(scoreUtilityHitHead(v9, flowInputs(null))).toBeCloseTo(-.7, 14)
    expect(attributeUtilityModel(v9, flowInputs(1), 'hit').contributions[64]).toBeCloseTo(.6, 14)
    expect(attributeUtilityModel(v9, flowInputs(1)).contributions.every((value) => value === 0)).toBe(true)
    expect(() => scoreUtilityHitHead(v8, flowInputs(1))).toThrow('schema 6')
    const { hitHead, hitTargetDefinition, ...withoutHit } = v9
    for (const invalid of [
      withoutHit,
      { ...withoutHit, hitHead },
      { ...withoutHit, hitTargetDefinition },
      { ...v9, hitHead: { ...hitHead, trees: hitHead.trees.slice(1) } },
      { ...v9, hitHead: { ...hitHead, baselinePrediction: Number.NaN } },
      { ...v9, hitTargetDefinition: { ...hitTargetDefinition, output: 'probability' } },
      { ...v9, hitTargetDefinition: { ...hitTargetDefinition, version: 'demeaned-tp7-net-v1' } },
      { ...v9, modelVersion: 'composite-return-v8' },
      { ...v9, featureNames: OBSERVED_INPUT_NAMES, observedInputVersion: OBSERVED_INPUT_VERSION },
      { ...v9, normalization: normalization() },
      { ...v8, hitHead },
      { ...v9, hitParameters: undefined },
      { ...v9, hitParameters: { learning_rate: 0 } },
      { ...v9, parameters: { learning_rate: 1.5 } },
      { ...v9, leafValuesAlreadyIncludeLearningRate: false },
      { ...v8, parameters: undefined },
      { ...v8, leafValuesAlreadyIncludeLearningRate: undefined },
    ]) expect(() => validateUtilityModel(invalid as UtilityModelArtifact)).toThrow()
  })
  it('puts internal node values on the leaf scale (× learning rate) before attributing each split', () => {
    const v8: CompositeReturnModelArtifact = { ...returnModel(), modelVersion: 'composite-return-v8',
      observedInputVersion: OBSERVED_FLOW_INPUT_VERSION, featureNames: OBSERVED_FLOW_INPUT_NAMES }
    const split = (featureIdx: number, value: number, left: number, right: number): UtilityTreeNode => (
      { isLeaf: false, value, featureIdx, numThreshold: 0, missingGoLeft: true, left, right })
    // scikit-learn keeps raw (unshrunk) values on internal nodes: 2 and 8 are 0.1 and 0.4 on the leaf scale.
    const tree = [split(64, 2, 1, 2), leaf(-.4), split(63, 8, 3, 4), leaf(.3), leaf(.6)]
    const artifact = { ...v8, trees: [tree, ...v8.trees.slice(1)] }
    const flowInputs = [...inputs(), ...Array(13).fill(null), 1, 1]
    const { bias, contributions } = attributeUtilityModel(artifact, flowInputs)
    expect(bias).toBeCloseTo(-.01 + .1, 14)
    expect(contributions[64]).toBeCloseTo(.4 - .1, 14)
    expect(contributions[63]).toBeCloseTo(.6 - .4, 14)
    expect(bias + contributions[63]! + contributions[64]!).toBeCloseTo(scoreUtilityModel(artifact, flowInputs).utility, 14)
    // Another learning rate rescales only the internal steps; the prediction and the total stay the same.
    const slower = attributeUtilityModel({ ...artifact, parameters: { learning_rate: .1 } }, flowInputs)
    expect(slower.contributions[64]).toBeCloseTo(.8 - .2, 14)
    expect(slower.contributions[63]).toBeCloseTo(.6 - .8, 14)
    expect(slower.bias + slower.contributions[63]! + slower.contributions[64]!).toBeCloseTo(.59, 14)
  })
  const composite = (): CompositeUtilityModelArtifact => ({
    schemaVersion: 4, modelVersion: 'composite-utility-v4',
    trainedLabelsThrough: model().trainedLabelsThrough, observedInputVersion: OBSERVED_INPUT_VERSION,
    featureNames: OBSERVED_INPUT_NAMES, normalization: normalization(),
    targetDefinition: { version: 'touch-nonloss-v1', formula: 'clip(touch)*clip(nonLoss)^2', horizon: 5, roundTripCostBps: 30 },
    heads: { touch: model(), nonLoss: model() },
  })
  it('combines separate head predictions and penalizes likely losses before normalization', () => {
    const artifact = composite()
    const safer = { ...artifact, heads: { touch: { ...model(), baselinePrediction: .5 }, nonLoss: { ...model(), baselinePrediction: .8 } } }
    const risky = { ...artifact, heads: { touch: { ...model(), baselinePrediction: .9 }, nonLoss: { ...model(), baselinePrediction: .3 } } }
    expect(scoreUtilityModel(safer, inputs()).utility).toBeCloseTo(.32, 14)
    expect(scoreUtilityModel(safer, inputs()).score).toBeGreaterThan(scoreUtilityModel(risky, inputs()).score)
    const clipped = { ...artifact, heads: { touch: { ...model(), baselinePrediction: 2 }, nonLoss: { ...model(), baselinePrediction: -.5 } } }
    expect(scoreUtilityModel(clipped, inputs()).utility).toBe(0)
  })
  it('rejects incompatible composite targets and malformed or missing heads', () => {
    const artifact = composite()
    const invalid = [
      { ...artifact, targetDefinition: undefined },
      { ...artifact, targetDefinition: { ...artifact.targetDefinition, version: 'unknown' } },
      { ...artifact, targetDefinition: { ...artifact.targetDefinition, formula: 'touch' } },
      { ...artifact, targetDefinition: { ...artifact.targetDefinition, roundTripCostBps: 0 } },
      { ...artifact, schemaVersion: 3 },
      { ...artifact, heads: undefined },
      { ...artifact, heads: { touch: model() } },
      { ...artifact, heads: { ...artifact.heads, extra: model() } },
      { ...artifact, heads: { ...artifact.heads, touch: { ...model(), trees: [] } } },
      { ...artifact, heads: { ...artifact.heads, nonLoss: { ...model(), baselinePrediction: NaN } } },
      { ...artifact, trees: model().trees },
      { ...model(), schemaVersion: 4 },
    ]
    for (const candidate of invalid) expect(() => validateUtilityModel(candidate as UtilityModelArtifact)).toThrow()
    for (const name of ['touch', 'nonLoss'] as const) {
      expect(() => validateUtilityModel({ ...artifact, heads: { ...artifact.heads, [name]: model([leaf(0), leaf(0)]) } })).toThrow(/미연결/)
      expect(() => validateUtilityModel({ ...artifact, heads: { ...artifact.heads, [name]: model([{ ...leaf(0), isLeaf: false, left: 0, right: 0 }]) } })).toThrow(/연결/)
    }
  })
  it('matches the independent native sklearn vectors including observed missing inputs', () => {
    expect(parity.featureNames).toEqual(OBSERVED_INPUT_NAMES)
    expect(parity.cases.some((c) => c.inputs.includes(null))).toBe(true)
    for (const witness of parity.cases) {
      const result = scoreUtilityModel(frozenUtilityModel, witness.inputs)
      expect(result.utility, witness.id).toBeCloseTo(Math.min(1, Math.max(0, witness.prediction)), 14)
      expect(result.score, witness.id).toBe(witness.overallScore)
      expect(scoreUtilityModel(frozenUtilityModel,
        witness.inputs.map((v) => v === null ? Number.NaN : v))).toEqual(result)
    }
  })

  it('uses inclusive numeric splits and the recorded native missing direction', () => {
    const artifact = model([{ ...leaf(0), isLeaf: false, featureIdx: 0, numThreshold: 2,
      missingGoLeft: true, left: 1, right: 2 }, leaf(0.125), leaf(-0.225)])
    for (const value of [null, Number.NaN, 2, 1.999999999]) {
      const x = inputs(); x[0] = value
      expect(scoreUtilityModel(artifact, x)).toEqual({ utility: 0.525, score: 74 })
    }
    const x = inputs(); x[0] = 2.000000001
    expect(scoreUtilityModel(artifact, x).utility).toBeCloseTo(0.175, 15)
    expect(scoreUtilityModel(artifact, x).score).toBe(15)
    const other = { ...artifact, trees: [[{ ...artifact.trees[0]![0]!, missingGoLeft: false }, ...artifact.trees[0]!.slice(1)], ...artifact.trees.slice(1)] }
    expect(scoreUtilityModel(other, inputs()).score).toBe(15)
  })

  it('sums already weighted leaves once and preserves clipped utility while using the fixed reference scale', () => {
    const artifact = { ...model(), baselinePrediction: 0.12,
      trees: Array.from({ length: 100 }, () => [leaf(0.002)]) }
    const result = scoreUtilityModel(artifact, inputs())
    expect(result.utility).toBeCloseTo(0.32, 14)
    expect(result.score).toBe(34)
    expect(scoreUtilityModel({ ...model(), baselinePrediction: -0.1 }, inputs())).toEqual({ utility: 0, score: 7 })
    expect(scoreUtilityModel({ ...model(), baselinePrediction: 1.1 }, inputs())).toEqual({ utility: 1, score: 97 })
  })

  it('maps the fixed mean to 50, one standard deviation to 70 or 30, and bounds the tails smoothly', () => {
    const reference = { ...normalization(), mean: 0.5, standardDeviation: 0.125 }
    expect(normalizeUtilityScore(reference, 0.5)).toBe(50)
    expect(normalizeUtilityScore(reference, 0.625)).toBe(70)
    expect(normalizeUtilityScore(reference, 0.375)).toBe(30)
    expect(normalizeUtilityScore(reference, -1)).toBe(7)
    expect(normalizeUtilityScore(reference, 2)).toBe(93)
    expect(normalizeUtilityScore(reference, 0.501)).toBe(50)
    expect(normalizeUtilityScore(reference, 0.504)).toBe(51)
    const scores = Array.from({ length: 1001 }, (_, i) => normalizeUtilityScore(reference, i / 1000))
    expect(scores.every((score) => Number.isInteger(score) && score >= 0 && score <= 100)).toBe(true)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
    const tinyReference = { ...normalization(), standardDeviation: Number.MIN_VALUE }
    expect(normalizeUtilityScore(tinyReference, 0.4)).toBe(50)
    expect(normalizeUtilityScore(tinyReference, 1)).toBe(100)
    expect(normalizeUtilityScore(tinyReference, 0)).toBe(0)
  })

  it('preserves the upper score differences instead of tying every strong candidate at 100', () => {
    const reference = normalization()
    expect([0.64, 0.65, 0.66, 0.80].map((utility) => normalizeUtilityScore(reference, utility)))
      .toEqual([86, 87, 88, 93])
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
      { ...normalization(), oneStandardDeviationScore: 75 },
      { ...normalization(), tailCurvature: 0 },
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
    expect(() => validateUtilityModel({ ...model(), modelVersion: 'composite-utility-v1' } as unknown as UtilityModelArtifact)).toThrow(/모델 계약/)
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
