import type { SpawnSyncReturns } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { InnerOofSplit, StudyOrigin } from '../../../lib/tli/eval/types'
import type { M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../lib/tli/model/predict'
import {
  assertScientificM1AvailabilityReceipt,
  buildExpectedScientificM1AvailabilityReceipt,
  buildScientificM1AvailabilitySidecar,
  type ScientificM1AvailabilityReceipt,
} from './scientific-m1-availability'
import { spawnM1ScientificTraining } from './m1-runtime'
import type {
  M1ScientificTrainingDataset,
  ScientificM1JoinedRow,
} from './offline-eval-scientific-m1'

export type ScientificM1Trainer = (
  scriptArgs: readonly string[],
) => SpawnSyncReturns<string>

export type ScientificM1PythonParity = {
  readonly trainingInputMatch: true
  readonly innerOofMatch: true
  readonly innerPointInTimeMatch: true
  readonly observedRowCount: number
  readonly featureSchema: readonly string[]
  readonly innerOofSplitSha256: string
  readonly availabilitySidecarSha256: string
  readonly innerPurgeReceiptSha256: string
}

export type ScientificM1TrainedFit = {
  readonly foldId: string
  readonly trainingInputPath: string
  readonly trainingInputSha256: string
  readonly availabilitySidecarPath: string
  readonly availabilitySidecarSha256: string
  readonly innerPurgeReceiptPath: string
  readonly innerPurgeReceiptSha256: string
  readonly innerPurgeReceipt: ScientificM1AvailabilityReceipt
  readonly artifactPath: string
  readonly artifactSha256: string
  readonly artifact: M1ModelArtifactV2
  readonly pythonParity: ScientificM1PythonParity
}

export class ScientificM1TrainingError extends Error {
  readonly name = 'ScientificM1TrainingError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

const sha256 = (payload: string | Buffer): string => (
  createHash('sha256').update(payload).digest('hex')
)

const normalizedInnerOof = (
  split: InnerOofSplit,
  orderedOrigins: readonly string[],
) => ({
  origin_count: split.originCount,
  fold_count: split.foldCount,
  ordered_origins: orderedOrigins,
  folds: split.folds.map((fold) => ({
    fold_id: fold.foldId,
    validation_origin: fold.validationOrigin,
    train_origins: fold.trainOrigins,
  })),
  split_origins_sha256: split.splitOriginsSha256,
})

const assertArtifactParity = (input: {
  readonly artifact: M1ModelArtifactV2
  readonly dataset: M1ScientificTrainingDataset
  readonly trainingOrigins: readonly string[]
  readonly innerOof: InnerOofSplit
  readonly fitId: string
  readonly availabilitySidecarSha256: string
  readonly innerPurgeReceiptSha256: string
}): ScientificM1PythonParity => {
  const events = input.dataset.rows.filter((row) => row.y).length
  const expectedRate = events / input.dataset.rows.length
  const trainingInputMatch = (
    JSON.stringify(input.artifact.feature_schema) === JSON.stringify(input.dataset.feature_schema)
    && JSON.stringify(input.artifact.train_range) === JSON.stringify(input.dataset.train_range)
    && input.artifact.labeler_version === input.dataset.labeler_version
    && input.artifact.sample_report.observed_n === input.dataset.rows.length
    && input.artifact.sample_report.events === events
    && Math.abs(input.artifact.sample_report.event_rate - expectedRate) <= Number.EPSILON
    && Math.abs(input.artifact.train_event_rate - expectedRate) <= Number.EPSILON
  )
  if (!trainingInputMatch) {
    throw new ScientificM1TrainingError('python_training_input_mismatch', input.fitId)
  }
  const expectedInner = normalizedInnerOof(input.innerOof, input.trainingOrigins)
  if (JSON.stringify(input.artifact.inner_oof) !== JSON.stringify(expectedInner)) {
    throw new ScientificM1TrainingError('python_inner_oof_mismatch', input.fitId)
  }
  return {
    trainingInputMatch: true,
    innerOofMatch: true,
    innerPointInTimeMatch: true,
    observedRowCount: input.artifact.sample_report.observed_n,
    featureSchema: input.artifact.feature_schema,
    innerOofSplitSha256: input.artifact.inner_oof.split_origins_sha256,
    availabilitySidecarSha256: input.availabilitySidecarSha256,
    innerPurgeReceiptSha256: input.innerPurgeReceiptSha256,
  }
}

export function trainScientificM1Fit(input: {
  readonly fitId: string
  readonly dataset: M1ScientificTrainingDataset
  readonly joinedRows: readonly ScientificM1JoinedRow[]
  readonly studyOrigins: readonly StudyOrigin[]
  readonly trainingOrigins: readonly string[]
  readonly innerOof: InnerOofSplit
  readonly workDir: string
  readonly trainedAt: string
  readonly trainer: ScientificM1Trainer
}): ScientificM1TrainedFit {
  const fitDir = join(input.workDir, input.fitId)
  mkdirSync(fitDir, { recursive: true })
  const trainingInputPath = join(fitDir, 'training.json')
  const availabilitySidecarPath = join(fitDir, 'inner-pit-sidecar.json')
  const artifactPath = join(fitDir, 'artifact.json')
  const innerPurgeReceiptPath = join(fitDir, 'inner-pit-receipt.json')
  const trainingBytes = `${JSON.stringify(input.dataset, null, 2)}\n`
  const trainingInputSha256 = sha256(trainingBytes)
  const sidecar = buildScientificM1AvailabilitySidecar({
    trainingInputSha256,
    dataset: input.dataset,
    joinedRows: input.joinedRows,
    studyOrigins: input.studyOrigins,
    innerOof: input.innerOof,
  })
  const sidecarBytes = `${JSON.stringify(sidecar, null, 2)}\n`
  const availabilitySidecarSha256 = sha256(sidecarBytes)
  const expectedReceipt = buildExpectedScientificM1AvailabilityReceipt({
    sidecar,
    sidecarSha256: availabilitySidecarSha256,
  })
  writeFileSync(trainingInputPath, trainingBytes)
  writeFileSync(availabilitySidecarPath, sidecarBytes)
  const processResult = input.trainer([
    '--trained-at', input.trainedAt,
    trainingInputPath, availabilitySidecarPath, artifactPath, innerPurgeReceiptPath,
  ])
  if (processResult.status !== 0) {
    const reason = (processResult.stderr || processResult.stdout || `exit ${String(processResult.status)}`).trim()
    throw new ScientificM1TrainingError('python_training_failed', `${input.fitId}: ${reason}`)
  }
  const artifactBytes = readFileSync(artifactPath)
  const receiptBytes = readFileSync(innerPurgeReceiptPath)
  const parsedArtifact: unknown = JSON.parse(artifactBytes.toString('utf8'))
  const parsedReceipt: unknown = JSON.parse(receiptBytes.toString('utf8'))
  const artifact = parseM1ModelArtifact(parsedArtifact)
  const innerPurgeReceipt = assertScientificM1AvailabilityReceipt({
    expected: expectedReceipt,
    actual: parsedReceipt,
    fitId: input.fitId,
  })
  const innerPurgeReceiptSha256 = sha256(receiptBytes)
  return {
    foldId: input.fitId,
    trainingInputPath,
    trainingInputSha256,
    availabilitySidecarPath,
    availabilitySidecarSha256,
    innerPurgeReceiptPath,
    innerPurgeReceiptSha256,
    innerPurgeReceipt,
    artifactPath,
    artifactSha256: sha256(artifactBytes),
    artifact,
    pythonParity: assertArtifactParity({
      artifact,
      dataset: input.dataset,
      trainingOrigins: input.trainingOrigins,
      innerOof: input.innerOof,
      fitId: input.fitId,
      availabilitySidecarSha256,
      innerPurgeReceiptSha256,
    }),
  }
}

export const defaultScientificM1Trainer = spawnM1ScientificTraining
