import { describe, expect, it } from 'vitest'

import { canonicalJsonV1 } from '../../../../lib/tli/canonical-json'
import { buildConfirmatoryFeatureVector, CONFIRMATORY_FEATURE_NAMES } from '../../../../lib/tli/features/build-confirmatory-features'
import { evaluateScientificM1Predictions } from '../continuous-ic'
import {
  buildScientificM1EvaluationPlan,
  type ScientificM1EvaluationPlan,
} from '../offline-eval-scientific-m1'
import { parseScientificM1StudyInput } from '../scientific-m1-input'
import {
  buildScientificM1Fixture,
  CYCLE_ID,
  ORIGINS,
  STUDY_CONTRACT_ID,
  STUDY_CONTRACT_SHA256,
} from './offline-eval-scientific-m1-fixture'

const buildPlan = (): ScientificM1EvaluationPlan => (
  buildScientificM1EvaluationPlan(parseScientificM1StudyInput(buildScientificM1Fixture()))
)

describe('Todo 11 scientific M1 study adapter', () => {
  it('builds 13 outer Python datasets plus one prospective full fit from 26 origins', () => {
    // Given: one parsed 26-origin study with twelve balanced confirmatory rows per origin.
    const input = parseScientificM1StudyInput(buildScientificM1Fixture())

    // When: the committed walk-forward authority builds the M1 evaluation plan.
    const plan = buildScientificM1EvaluationPlan(input)

    // Then: every required fold and Python-v2 training manifest is present under one study identity.
    expect(plan).toMatchObject({
      cycleId: CYCLE_ID,
      studyContractId: STUDY_CONTRACT_ID,
      studyContractSha256: STUDY_CONTRACT_SHA256,
      originCount: 26,
      testOriginCount: 13,
    })
    expect(plan.outerFolds).toHaveLength(13)
    expect(plan.outerFolds[0]?.candidateTrainOrigins).toHaveLength(13)
    expect(plan.outerFolds[0]?.trainOrigins).toHaveLength(13)
    expect(plan.outerFolds[0]?.trainingDataset).toMatchObject({
      dataset_version: 'tli-m1-training-dataset-v2',
      feature_schema: CONFIRMATORY_FEATURE_NAMES,
      labeler_version: 'gta-v2',
      train_range: [ORIGINS[0]?.originDate, ORIGINS[12]?.originDate],
    })
    expect(plan.outerFolds[0]?.trainingDataset.rows).toHaveLength(153)
    expect(plan.outerFolds[0]?.innerOof.foldCount).toBe(5)
    const validationOrigins = new Set(plan.outerFolds[0]?.innerOof.folds.map((fold) => fold.validationOrigin))
    const firstOofRows = plan.outerFolds[0]?.trainingDataset.rows.filter((row) => validationOrigins.has(row.base_date)) ?? []
    expect(firstOofRows.filter((row) => row.y)).toHaveLength(30)
    expect(firstOofRows.filter((row) => !row.y)).toHaveLength(30)
    expect(plan.prospective.trainingDataset.rows).toHaveLength(312)
    expect(plan.prospective.innerOof.foldCount).toBe(8)
  })

  it('classifies each first-fold purge by the exact failed availability condition', () => {
    // Given: the fixture has one overlap, one late-finalized, and one late-source sentinel.
    const plan = buildPlan()

    // When: the first test origin evaluates its expanding training prefix.
    const firstFold = plan.outerFolds[0]

    // Then: all three rows are excluded by createStudyWalkForwardFolds and carry one exact reason.
    expect(firstFold?.purgedRowIds).toEqual(['label-00-0', 'label-01-0', 'label-02-0'])
    expect(firstFold?.purgedRows).toEqual([
      { rowId: 'label-00-0', reasons: ['label_source_run_completed_after_forecast_cutoff'] },
      { rowId: 'label-01-0', reasons: ['label_finalized_after_forecast_cutoff'] },
      { rowId: 'label-02-0', reasons: ['future_window_not_before_test_origin'] },
    ])
  })

  it('copies the committed ten-slot snapshot byte-for-byte into the Python row', () => {
    // Given: a parsed row and its raw frozen confirmatory feature input.
    const fixture = buildScientificM1Fixture()
    const featureInput = fixture.featureInputs.at(0)
    if (featureInput === undefined) throw new RangeError('fixture must contain a feature input')
    const expected = buildConfirmatoryFeatureVector(featureInput)

    // When: the integration plan joins the dataset row to that feature snapshot.
    const plan = buildScientificM1EvaluationPlan(parseScientificM1StudyInput(fixture))
    const joined = plan.rows.at(0)
    const pythonRow = plan.prospective.trainingDataset.rows.at(0)

    // Then: provenance hash, vector order, missing flags, and label are unchanged at the Python boundary.
    expect(joined?.featureSnapshotSha256).toBe(expected.featureSnapshotSha256)
    expect(pythonRow).toEqual({
      theme_id: fixture.dataset.rows[0]?.themeId,
      base_date: fixture.dataset.rows[0]?.baseDate,
      features: expected.values,
      missing_flags: expected.missingFlags,
      y: fixture.dataset.rows[0]?.yBinary,
    })
  })

  it('is byte-identical across two builds of the same parsed input', () => {
    // Given: two independently generated copies of the same frozen fixture.
    const firstInput = parseScientificM1StudyInput(buildScientificM1Fixture())
    const secondInput = parseScientificM1StudyInput(buildScientificM1Fixture())

    // When: both copies are assembled into evaluation plans.
    const first = canonicalJsonV1(buildScientificM1EvaluationPlan(firstInput))
    const second = canonicalJsonV1(buildScientificM1EvaluationPlan(secondInput))

    // Then: their canonical bytes are identical.
    expect(first).toBe(second)
  })

  it('keeps binary outcomes and continuous g_log_ratio IC in separate metric fields', () => {
    // Given: probabilities strictly ordered by the continuous return target within each origin.
    const plan = buildPlan()
    const predictions = plan.rows.map((row) => ({
      rowId: row.id,
      probability: (row.gLogRatio + 3) / 6,
    }))

    // When: the exported prediction adapter evaluates the same rows.
    const result = evaluateScientificM1Predictions({ rows: plan.rows, predictions })

    // Then: binary Brier/ECE metrics remain binary while continuous IC uses g_log_ratio.
    expect(result.continuousGLogRatioIc.raw).toBeCloseTo(1, 15)
    expect(result.binary.raw.ic).not.toBe(result.continuousGLogRatioIc.raw)
    expect(result.binary.raw.brier).not.toBeNull()
  })

  it('supports a deterministic shuffled-no-signal feature driver', () => {
    // Given: known-signal and origin-rotated no-signal fixtures under the same study contract.
    const known = buildScientificM1EvaluationPlan(parseScientificM1StudyInput(buildScientificM1Fixture()))
    const shuffled = buildScientificM1EvaluationPlan(
      parseScientificM1StudyInput(buildScientificM1Fixture('shuffled_no_signal')),
    )

    // When: the same label row is inspected after the deterministic feature shuffle.
    const knownRow = known.rows.find((row) => row.id === 'label-01-0')
    const shuffledRow = shuffled.rows.find((row) => row.id === 'label-01-0')

    // Then: labels/folds stay fixed while the preregistered feature snapshot changes.
    expect(shuffled.outerFolds).toHaveLength(13)
    expect(shuffledRow?.y).toBe(knownRow?.y)
    expect(shuffledRow?.featureSnapshotSha256).not.toBe(knownRow?.featureSnapshotSha256)
    expect(known.rows.every((row) => row.features.at(7) === 0)).toBe(true)
  })

  it('rejects a mixed-study feature row before any fold is built', () => {
    // Given: one feature input from another study SHA.
    const fixture = buildScientificM1Fixture()
    const mixed = {
      ...fixture,
      featureInputs: fixture.featureInputs.map((input, index) => (
        index === 0 ? { ...input, studyContractSha256: 'f'.repeat(64) } : input
      )),
    }

    // When: the parsed input reaches the semantic join boundary.
    const build = () => buildScientificM1EvaluationPlan(parseScientificM1StudyInput(mixed))

    // Then: mixed study provenance fails closed.
    expect(build).toThrow(/mixed study contract/)
  })

  it('rejects missing and duplicate feature rows', () => {
    // Given: one fixture with a missing input and another with a duplicated input.
    const fixture = buildScientificM1Fixture()
    const first = fixture.featureInputs.at(0)
    if (first === undefined) throw new RangeError('fixture must contain a feature input')
    const missing = { ...fixture, featureInputs: fixture.featureInputs.slice(1) }
    const duplicate = { ...fixture, featureInputs: [...fixture.featureInputs, first] }

    // When: both inputs are joined to dataset rows.
    const buildMissing = () => buildScientificM1EvaluationPlan(parseScientificM1StudyInput(missing))
    const buildDuplicate = () => buildScientificM1EvaluationPlan(parseScientificM1StudyInput(duplicate))

    // Then: neither ambiguous cardinality reaches Python.
    expect(buildMissing).toThrow(/missing confirmatory feature input/)
    expect(buildDuplicate).toThrow(/duplicate confirmatory feature input/)
  })

  it('rejects noncanonical cycle IDs and internally inconsistent dataset manifests', () => {
    // Given: an uppercase UUID and a manifest whose count was changed without changing its content.
    const fixture = buildScientificM1Fixture()
    const uppercaseCycle = { ...fixture, cycleId: CYCLE_ID.toUpperCase() }
    const mismatchedManifest = {
      ...fixture,
      dataset: {
        ...fixture.dataset,
        manifest: { ...fixture.dataset.manifest, row_count: fixture.dataset.rows.length + 1 },
      },
    }

    // When: both values cross the unknown-input parser.
    const parseCycle = () => parseScientificM1StudyInput(uppercaseCycle)
    const parseManifest = () => parseScientificM1StudyInput(mismatchedManifest)

    // Then: the parser fails closed before feature construction.
    expect(parseCycle).toThrow(/canonical lowercase UUID/)
    expect(parseManifest).toThrow(/dataset manifest SHA-256 mismatch/)
  })
})
