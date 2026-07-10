import type { SpawnSyncReturns } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseM1ModelArtifact } from '../../../../lib/tli/model/predict'
import { buildScientificM1EvaluationPlan } from '../offline-eval-scientific-m1'
import { parseScientificM1StudyInput } from '../scientific-m1-input'
import { buildScientificM1ParityGolden } from '../scientific-m1-parity'
import {
  runScientificStudyBridge,
  ScientificStudyBridgeError,
  type StudyEvalBridgeRunner,
} from '../scientific-study-bridge'
import type { ScientificM1TrainingResult, ScientificM1TrainedFit } from '../scientific-m1-training'
import { buildScientificM1Fixture } from './offline-eval-scientific-m1-fixture'
import goldenFixture from '../../../../lib/tli/__tests__/fixtures/m1-golden-vector.json'

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

const processResult = (status: number, stderr = ''): SpawnSyncReturns<string> => ({
  pid: 1, output: [null, '', stderr], stdout: '', stderr, status, signal: null, error: undefined,
})

const buildTraining = (directory: string): ScientificM1TrainingResult => {
  const plan = buildScientificM1EvaluationPlan(parseScientificM1StudyInput(buildScientificM1Fixture()))
  const artifact = parseM1ModelArtifact(goldenFixture.artifact)
  const buildFit = (foldId: string, rowCount: number): ScientificM1TrainedFit => {
    const trainingInputPath = join(directory, `${foldId}-training.json`)
    const availabilitySidecarPath = join(directory, `${foldId}-inner-pit-sidecar.json`)
    const innerPurgeReceiptPath = join(directory, `${foldId}-inner-pit-receipt.json`)
    const artifactPath = join(directory, `${foldId}-artifact.json`)
    const trainingBytes = `${foldId}\n`
    const sidecarBytes = `${foldId}-sidecar\n`
    const receiptBytes = `${foldId}-receipt\n`
    const artifactBytes = `${foldId}-artifact\n`
    writeFileSync(trainingInputPath, trainingBytes)
    writeFileSync(availabilitySidecarPath, sidecarBytes)
    writeFileSync(innerPurgeReceiptPath, receiptBytes)
    writeFileSync(artifactPath, artifactBytes)
    const availabilitySidecarSha256 = hash(sidecarBytes)
    const innerPurgeReceiptSha256 = hash(receiptBytes)
    return {
      foldId,
      trainingInputPath,
      trainingInputSha256: hash(trainingBytes),
      availabilitySidecarPath,
      availabilitySidecarSha256,
      innerPurgeReceiptPath,
      innerPurgeReceiptSha256,
      innerPurgeReceipt: {
        receipt_version: 'tli-m1-inner-pit-receipt-v1',
        training_input_sha256: hash(trainingBytes),
        sidecar_sha256: availabilitySidecarSha256,
        inner_oof_split_sha256: artifact.inner_oof.split_origins_sha256,
        folds: [{
          fold_id: 'inner-01',
          validation_origin: '2025-05-27',
          validation_forecast_cutoff: '2025-05-27T09:00:00.000Z',
          candidate_row_ids: ['candidate-row'],
          eligible_row_ids: ['candidate-row'],
          purged_rows: [],
        }],
      },
      artifactPath,
      artifactSha256: hash(artifactBytes),
      artifact,
      pythonParity: {
        trainingInputMatch: true,
        innerOofMatch: true,
        innerPointInTimeMatch: true,
        observedRowCount: rowCount,
        featureSchema: artifact.feature_schema,
        innerOofSplitSha256: artifact.inner_oof.split_origins_sha256,
        availabilitySidecarSha256,
        innerPurgeReceiptSha256,
      },
    }
  }
  const outerFolds = plan.outerFolds.map((fold) => ({
    ...buildFit(fold.foldId, fold.trainingDataset.rows.length),
    testOrigin: fold.testOrigin.originDate,
    predictions: fold.testRows.map((row) => ({
      rowId: row.id,
      id: `${row.themeId}|${row.baseDate}`,
      themeId: row.themeId,
      baseDate: row.baseDate,
      probability: row.y ? 0.8 : 0.2,
      y: row.y,
      gLogRatio: row.gLogRatio,
    })),
  }))
  return {
    studyContractId: plan.studyContractId,
    studyContractSha256: plan.studyContractSha256,
    datasetManifestSha256: plan.datasetManifestSha256,
    walkForwardSplitSha256: plan.walkForwardSplitSha256,
    outerFolds,
    prospective: buildFit('prospective', plan.prospective.trainingDataset.rows.length),
    predictions: outerFolds.flatMap((fold) => fold.predictions),
  }
}

const bridgeRunner = (training: ScientificM1TrainingResult): StudyEvalBridgeRunner => (args) => {
  const outputPath = args.at(-1)
  if (outputPath === undefined) return processResult(2, 'missing output')
  const accepted = Array.from({ length: 500 }, (_unused, index) => ({
    replicate_index: index,
    attempt_index: 0,
    index_sha256: hash(`indices-${index}`),
    reason: null,
    seed: index + 1,
    artifact_sha256: hash(`artifact-${index}`),
  }))
  const replicateBodies = Array.from({ length: 500 }, (_unused, index) => ({
    replicate_index: index,
    scaler: {
      median: Array.from({ length: 10 }, (_slot, slot) => slot * 0.1),
      mad: Array.from({ length: 10 }, (_slot, slot) => 1 + slot * 0.1),
    },
    coefficients: {
      intercept: 0.05,
      weights: Array.from({ length: 20 }, (_slot, slot) => 0.01 * (slot + 1)),
    },
    calibrator: { a: -1, b: 0 },
  }))
  writeFileSync(outputPath, `${JSON.stringify({
    bridge_version: 'tli-study-eval-bridge-v1',
    study_contract_id: training.studyContractId,
    study_contract_sha256: training.studyContractSha256,
    cycle_id: 'abcdefab-0000-4000-8000-000000000001',
    runtime: {
      uv_version: '0.9.25', python_version: '3.13.11', packages: [],
      thread_env: { PYTHONHASHSEED: '0' }, bridge_lock_sha256: 'a'.repeat(64),
    },
    training_parity: training.outerFolds.map((fold) => ({
      fold_id: fold.foldId,
      expected_sha256: fold.trainingInputSha256,
      actual_sha256: fold.trainingInputSha256,
      canonical_dataset_sha256: hash(`canonical-${fold.foldId}`),
      row_count: fold.pythonParity.observedRowCount,
      feature_schema: fold.pythonParity.featureSchema,
    })),
    statistics: {
      delta_brier: {
        seed: 1, point: -0.21, upper_99: -0.1,
        replicate_sha256: hash('delta'), positive_skill: true,
      },
      candidate_ece: { seed: 2, point: 0.1, upper: 0.2, replicate_sha256: hash('ece') },
      power: { comparator_brier: 0.25, minimum_relevant_effect: 0.02, planned_origins: 16, points: [] },
    },
    interval_ensemble: {
      full_fit_estimator_sha256: hash('estimator'),
      accepted,
      rejected: [],
      probe: {
        full_fit_probability: 0.8, lower: 0.7, upper: 0.9,
        replicate_probability_sha256: hash('probe'),
      },
      replicate_bodies: replicateBodies,
    },
  }, null, 2)}\n`)
  return processResult(0)
}

describe('scientific study Python bridge boundary', () => {
  it('verifies all 13 TS input hashes and exactly 500 accepted interval fits', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-study-bridge-'))
    try {
      const study = parseScientificM1StudyInput(buildScientificM1Fixture())
      const plan = buildScientificM1EvaluationPlan(study)
      const training = buildTraining(directory)
      const pairedRows = training.predictions.map((row) => ({
        themeId: row.themeId,
        originDate: row.baseDate,
        candidateProbability: row.probability ?? 0.5,
        comparatorProbability: 0.5,
        y: row.y,
      }))

      const result = runScientificStudyBridge({
        study, plan, training, pairedRows, workDir: directory,
        runner: bridgeRunner(training),
      })

      expect(result.output.training_parity).toHaveLength(13)
      expect(result.output.interval_ensemble.accepted).toHaveLength(500)
      expect(result.output.statistics.delta_brier.positive_skill).toBe(true)
      expect(result.output.study_contract_sha256).toBe(training.studyContractSha256)
      const parity = buildScientificM1ParityGolden({ study, plan, training, bridge: result })
      expect(parity.outerFolds[0]?.ts.innerPurgeReceipt)
        .toEqual(training.outerFolds[0]?.innerPurgeReceipt)
      expect(parity.outerFolds[0]?.ts.availabilitySidecarSha256)
        .toBe(training.outerFolds[0]?.availabilitySidecarSha256)
      expect(parity.outerFolds[0]?.ts.innerPurgeReceiptSha256)
        .toBe(training.outerFolds[0]?.innerPurgeReceiptSha256)
      expect(parity.outerFolds[0]?.matches.innerPointInTime).toBe(true)
      expect(JSON.stringify(parity)).not.toContain(directory)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('hard-fails on a nonzero bridge process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-study-bridge-'))
    try {
      const study = parseScientificM1StudyInput(buildScientificM1Fixture())
      const plan = buildScientificM1EvaluationPlan(study)
      const training = buildTraining(directory)
      expect(() => runScientificStudyBridge({
        study, plan, training, pairedRows: [], workDir: directory,
        runner: () => processResult(4, 'bootstrap failed'),
      })).toThrowError(new ScientificStudyBridgeError('python_bridge_failed', 'bootstrap failed'))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps report-visible bridge digests independent of the work directory', () => {
    const firstDirectory = mkdtempSync(join(tmpdir(), 'tli-study-bridge-first-'))
    const secondDirectory = mkdtempSync(join(tmpdir(), 'tli-study-bridge-second-'))
    try {
      const study = parseScientificM1StudyInput(buildScientificM1Fixture())
      const plan = buildScientificM1EvaluationPlan(study)
      const firstTraining = buildTraining(firstDirectory)
      const secondTraining = buildTraining(secondDirectory)
      const pairedRows = firstTraining.predictions.map((row) => ({
        themeId: row.themeId,
        originDate: row.baseDate,
        candidateProbability: row.probability ?? 0.5,
        comparatorProbability: 0.5,
        y: row.y,
      }))

      const first = runScientificStudyBridge({
        study, plan, training: firstTraining, pairedRows,
        workDir: join(firstDirectory, 'bridge'), runner: bridgeRunner(firstTraining),
      })
      const second = runScientificStudyBridge({
        study, plan, training: secondTraining, pairedRows,
        workDir: join(secondDirectory, 'bridge'), runner: bridgeRunner(secondTraining),
      })

      expect(first.requestContractSha256).toBe(second.requestContractSha256)
      expect(first.outputContractSha256).toBe(second.outputContractSha256)
    } finally {
      rmSync(firstDirectory, { recursive: true, force: true })
      rmSync(secondDirectory, { recursive: true, force: true })
    }
  })
})
