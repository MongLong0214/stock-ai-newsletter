import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpawnSyncReturns } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import type { M1ModelArtifactV2 } from '../../../../lib/tli/model/m1'
import { createInnerOofSplit } from '../../../../lib/tli/eval/walk-forward'
import { buildScientificM1EvaluationPlan } from '../offline-eval-scientific-m1'
import { parseScientificM1StudyInput } from '../scientific-m1-input'
import {
  buildExpectedScientificM1AvailabilityReceipt,
  scientificM1AvailabilitySidecarSchema,
  type ScientificM1AvailabilityReceipt,
} from '../scientific-m1-availability'
import {
  runScientificM1Training,
  ScientificM1TrainingError,
  type ScientificM1Trainer,
} from '../scientific-m1-training'
import { buildScientificM1Fixture } from './offline-eval-scientific-m1-fixture'

type GoldenFixture = {
  readonly artifact: M1ModelArtifactV2
}

const golden = JSON.parse(
  readFileSync('lib/tli/__tests__/fixtures/m1-golden-vector.json', 'utf8'),
) as GoldenFixture

const result = (status: number, stderr = ''): SpawnSyncReturns<string> => ({
  pid: 1,
  output: [null, '', stderr],
  stdout: '',
  stderr,
  status,
  signal: null,
  error: undefined,
})

type FakeTrainerMutations = {
  readonly artifact?: (artifact: M1ModelArtifactV2) => unknown
  readonly receipt?: (receipt: ScientificM1AvailabilityReceipt) => unknown
}

const hash = (payload: string | Buffer): string => createHash('sha256').update(payload).digest('hex')

const fakeTrainer = (mutations: FakeTrainerMutations = {}): ScientificM1Trainer => (
  scriptArgs,
) => {
  const datasetPath = scriptArgs.at(-4)
  const sidecarPath = scriptArgs.at(-3)
  const artifactPath = scriptArgs.at(-2)
  const receiptPath = scriptArgs.at(-1)
  if (
    datasetPath === undefined
    || sidecarPath === undefined
    || artifactPath === undefined
    || receiptPath === undefined
  ) return result(2, 'missing paths')
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
    readonly train_range: readonly [string, string]
    readonly rows: readonly { readonly base_date: string; readonly y: boolean }[]
  }
  const origins = [...new Set(dataset.rows.map((row) => row.base_date))].sort()
  const expected = createInnerOofSplit(origins)
  const artifact: M1ModelArtifactV2 = {
    ...golden.artifact,
    train_range: dataset.train_range,
    labeler_version: 'gta-v2',
    train_event_rate: dataset.rows.filter((row) => row.y).length / dataset.rows.length,
    inner_oof: {
      origin_count: expected.originCount,
      fold_count: expected.foldCount,
      ordered_origins: origins,
      folds: expected.folds.map((fold) => ({
        fold_id: fold.foldId,
        validation_origin: fold.validationOrigin,
        train_origins: fold.trainOrigins,
      })),
      split_origins_sha256: expected.splitOriginsSha256,
    },
    sample_report: {
      ...golden.artifact.sample_report,
      observed_n: dataset.rows.length,
      events: dataset.rows.filter((row) => row.y).length,
      event_rate: dataset.rows.filter((row) => row.y).length / dataset.rows.length,
    },
  }
  const sidecarBytes = readFileSync(sidecarPath)
  const sidecar = scientificM1AvailabilitySidecarSchema.parse(JSON.parse(sidecarBytes.toString('utf8')))
  const receipt = buildExpectedScientificM1AvailabilityReceipt({
    sidecar,
    sidecarSha256: hash(sidecarBytes),
  })
  writeFileSync(artifactPath, `${JSON.stringify(mutations.artifact?.(artifact) ?? artifact, null, 2)}\n`)
  writeFileSync(receiptPath, `${JSON.stringify(mutations.receipt?.(receipt) ?? receipt, null, 2)}\n`)
  return result(0)
}

describe('scientific M1 Python training boundary', () => {
  it('trains 13 outer artifacts plus one prospective artifact and proves inner-OOF parity', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-m1-training-'))
    try {
      const plan = buildScientificM1EvaluationPlan(
        parseScientificM1StudyInput(buildScientificM1Fixture()),
      )

      const trained = runScientificM1Training({
        plan,
        workDir: directory,
        trainedAt: '2026-01-31',
        trainer: fakeTrainer(),
      })

      expect(trained.outerFolds).toHaveLength(13)
      expect(trained.predictions).toHaveLength(13 * 12)
      expect(trained.outerFolds.every((fold) => fold.pythonParity.innerOofMatch)).toBe(true)
      expect(trained.outerFolds.every((fold) => fold.pythonParity.trainingInputMatch)).toBe(true)
      expect(trained.outerFolds.every((fold) => fold.pythonParity.innerPointInTimeMatch)).toBe(true)
      expect(trained.prospective.pythonParity.innerOofMatch).toBe(true)
      expect(trained.prospective.pythonParity.trainingInputMatch).toBe(true)
      expect(trained.prospective.pythonParity.innerPointInTimeMatch).toBe(true)
      expect(trained.outerFolds[0]?.trainingInputSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(trained.outerFolds[0]?.availabilitySidecarSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(trained.outerFolds[0]?.innerPurgeReceiptSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(trained.outerFolds[0]?.artifactSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(trained.outerFolds[0]?.innerPurgeReceipt.folds[0]?.purged_rows).toEqual([
        { row_id: 'label-03-0', reasons: ['future_window_not_before_validation_origin'] },
        { row_id: 'label-04-0', reasons: ['label_finalized_after_validation_cutoff'] },
        { row_id: 'label-05-0', reasons: ['label_source_run_completed_after_validation_cutoff'] },
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('hard-fails the whole study on a nonzero trainer exit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-m1-training-'))
    try {
      const plan = buildScientificM1EvaluationPlan(
        parseScientificM1StudyInput(buildScientificM1Fixture()),
      )
      const trainer: ScientificM1Trainer = () => result(3, 'minority class floor')

      expect(() => runScientificM1Training({
        plan,
        workDir: directory,
        trainedAt: '2026-01-31',
        trainer,
      })).toThrowError(new ScientificM1TrainingError('python_training_failed', 'outer-01: minority class floor'))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects v1 output without attempting a compatibility parse', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-m1-training-'))
    try {
      const plan = buildScientificM1EvaluationPlan(
        parseScientificM1StudyInput(buildScientificM1Fixture()),
      )
      const trainer = fakeTrainer({
        artifact: (artifact) => ({ ...artifact, artifact_version: 'tli-model-artifact-v1' }),
      })

      expect(() => runScientificM1Training({
        plan,
        workDir: directory,
        trainedAt: '2026-01-31',
        trainer,
      })).toThrowError('unsupported_legacy_artifact')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('hard-fails when the Python receipt changes an eligible row set', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tli-m1-training-'))
    try {
      const plan = buildScientificM1EvaluationPlan(
        parseScientificM1StudyInput(buildScientificM1Fixture()),
      )
      const trainer = fakeTrainer({
        receipt: (receipt) => {
          const first = receipt.folds[0]
          if (first === undefined) throw new RangeError('fixture requires an inner fold')
          return {
            ...receipt,
            folds: [{ ...first, eligible_row_ids: first.eligible_row_ids.slice(1) }, ...receipt.folds.slice(1)],
          }
        },
      })

      expect(() => runScientificM1Training({
        plan,
        workDir: directory,
        trainedAt: '2026-01-31',
        trainer,
      })).toThrowError('python_inner_pit_receipt_mismatch')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
