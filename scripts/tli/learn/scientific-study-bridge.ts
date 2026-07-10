import type { SpawnSyncReturns } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json-v1'
import {
  M1_DETERMINISM_ENV,
  resolvePinnedPythonScriptInvocation,
} from './m1-runtime'
import type { ScientificM1EvaluationPlan } from './offline-eval-scientific-m1'
import type { ScientificM1StudyInput } from './scientific-m1-input'
import type { ScientificM1TrainingResult } from './scientific-m1-training'
import {
  parseScientificStudyBridgeOutput,
  STUDY_EVAL_BRIDGE_VERSION,
  type ScientificStudyBridgeOutput,
  type ScientificStudyBridgePairedRow,
} from './scientific-study-bridge-contract'

export const STUDY_EVAL_BRIDGE_SCRIPT = 'scripts/tli/learn/study_eval_bridge.py'
export const STUDY_EVAL_BRIDGE_COMMAND = 'uv'

export type StudyEvalBridgeRunner = (
  args: readonly string[],
) => SpawnSyncReturns<string>

export type ScientificStudyBridgeResult = {
  readonly requestPath: string
  readonly requestContractSha256: string
  readonly outputPath: string
  readonly outputContractSha256: string
  readonly output: ScientificStudyBridgeOutput
}

export class ScientificStudyBridgeError extends Error {
  readonly name = 'ScientificStudyBridgeError'

  constructor(readonly code: string, readonly detail: string) {
    super(`${code}: ${detail}`)
  }
}

export const studyEvalBridgeArgs = (requestPath: string, outputPath: string): readonly string[] => [
  requestPath, outputPath,
]

export const spawnStudyEvalBridge: StudyEvalBridgeRunner = (args) => {
  const invocation = resolvePinnedPythonScriptInvocation({
    script: STUDY_EVAL_BRIDGE_SCRIPT,
    scriptArgs: args,
  })
  return spawnSync(
    invocation.command,
    [...invocation.args],
    { cwd: process.cwd(), encoding: 'utf8', env: invocation.env },
  )
}

const assertIdentity = (input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
  readonly training: ScientificM1TrainingResult
}): void => {
  const expectedId = input.study.dataset.manifest.study_contract_id
  const expectedSha = input.study.dataset.manifest.study_contract_sha256
  if (
    input.plan.studyContractId !== expectedId
    || input.plan.studyContractSha256 !== expectedSha
    || input.training.studyContractId !== expectedId
    || input.training.studyContractSha256 !== expectedSha
    || input.training.datasetManifestSha256 !== input.plan.datasetManifestSha256
    || input.training.walkForwardSplitSha256 !== input.plan.walkForwardSplitSha256
  ) {
    throw new ScientificStudyBridgeError('mixed_study_identity', expectedId)
  }
}

const assertPairedRows = (rows: readonly ScientificStudyBridgePairedRow[]): void => {
  for (const row of rows) {
    if (
      row.themeId.length === 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.originDate)
      || !Number.isFinite(row.candidateProbability)
      || !Number.isFinite(row.comparatorProbability)
      || row.candidateProbability < 0
      || row.candidateProbability > 1
      || row.comparatorProbability < 0
      || row.comparatorProbability > 1
    ) throw new ScientificStudyBridgeError('invalid_paired_row', `${row.themeId}|${row.originDate}`)
  }
}

const buildRequest = (input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
  readonly training: ScientificM1TrainingResult
  readonly pairedRows: readonly ScientificStudyBridgePairedRow[]
}) => {
  const probe = input.plan.rows.find((row) => !row.abstain)
  if (probe === undefined) throw new ScientificStudyBridgeError('missing_interval_probe', 'no non-abstain row')
  return {
    bridge_version: STUDY_EVAL_BRIDGE_VERSION,
    study_contract_id: input.plan.studyContractId,
    study_contract_sha256: input.plan.studyContractSha256,
    cycle_id: input.study.cycleId,
    paired_rows: input.pairedRows.map((row) => ({
      theme_id: row.themeId,
      origin_date: row.originDate,
      candidate_probability: row.candidateProbability,
      comparator_probability: row.comparatorProbability,
      y: row.y ? 1 : 0,
    })),
    training_inputs: input.training.outerFolds.map((fold) => ({
      fold_id: fold.foldId,
      path: fold.trainingInputPath,
      expected_sha256: fold.trainingInputSha256,
    })),
    full_fit: {
      training_input_path: input.training.prospective.trainingInputPath,
      expected_sha256: input.training.prospective.trainingInputSha256,
      artifact_path: input.training.prospective.artifactPath,
      artifact_sha256: input.training.prospective.artifactSha256,
      probe: { values: probe.features, missing: probe.missingFlags },
    },
  }
}

const requestContractSha256 = (request: ReturnType<typeof buildRequest>): string => (
  canonicalJsonV1Sha256({
    bridge_version: request.bridge_version,
    study_contract_id: request.study_contract_id,
    study_contract_sha256: request.study_contract_sha256,
    cycle_id: request.cycle_id,
    paired_rows: request.paired_rows,
    training_inputs: request.training_inputs.map((item) => ({
      fold_id: item.fold_id,
      expected_sha256: item.expected_sha256,
    })),
    full_fit: {
      expected_sha256: request.full_fit.expected_sha256,
      artifact_sha256: request.full_fit.artifact_sha256,
      probe: request.full_fit.probe,
    },
  })
)

const assertOutputParity = (input: {
  readonly study: ScientificM1StudyInput
  readonly training: ScientificM1TrainingResult
  readonly output: ScientificStudyBridgeOutput
}): void => {
  if (
    input.output.study_contract_id !== input.training.studyContractId
    || input.output.study_contract_sha256 !== input.training.studyContractSha256
    || input.output.cycle_id !== input.study.cycleId
  ) throw new ScientificStudyBridgeError('python_bridge_identity_mismatch', input.output.study_contract_id)
  if (input.output.training_parity.length !== input.training.outerFolds.length) {
    throw new ScientificStudyBridgeError('python_bridge_fold_count_mismatch', String(input.output.training_parity.length))
  }
  const parityByFold = new Map(input.output.training_parity.map((row) => [row.fold_id, row]))
  if (parityByFold.size !== input.output.training_parity.length) {
    throw new ScientificStudyBridgeError('python_bridge_duplicate_fold', 'training_parity')
  }
  for (const fold of input.training.outerFolds) {
    const parity = parityByFold.get(fold.foldId)
    if (
      parity === undefined
      || parity.expected_sha256 !== fold.trainingInputSha256
      || parity.actual_sha256 !== fold.trainingInputSha256
      || parity.row_count !== fold.pythonParity.observedRowCount
      || JSON.stringify(parity.feature_schema) !== JSON.stringify(fold.pythonParity.featureSchema)
    ) throw new ScientificStudyBridgeError('python_bridge_training_parity_mismatch', fold.foldId)
  }
}

export function runScientificStudyBridge(input: {
  readonly study: ScientificM1StudyInput
  readonly plan: ScientificM1EvaluationPlan
  readonly training: ScientificM1TrainingResult
  readonly pairedRows: readonly ScientificStudyBridgePairedRow[]
  readonly workDir: string
  readonly runner?: StudyEvalBridgeRunner
}): ScientificStudyBridgeResult {
  assertIdentity(input)
  assertPairedRows(input.pairedRows)
  mkdirSync(input.workDir, { recursive: true })
  const requestPath = join(input.workDir, 'study-eval-request.json')
  const outputPath = join(input.workDir, 'study-eval-output.json')
  const request = buildRequest(input)
  const encodedRequest = `${JSON.stringify(request, null, 2)}\n`
  writeFileSync(requestPath, encodedRequest)
  const result = (input.runner ?? spawnStudyEvalBridge)(studyEvalBridgeArgs(requestPath, outputPath))
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${String(result.status)}`).trim()
    throw new ScientificStudyBridgeError('python_bridge_failed', detail)
  }
  let outputBytes: Buffer
  try {
    outputBytes = readFileSync(outputPath)
  } catch (error) {
    throw new ScientificStudyBridgeError(
      'python_bridge_output_missing', error instanceof Error ? error.message : String(error),
    )
  }
  const parsed: unknown = JSON.parse(outputBytes.toString('utf8'))
  const output = parseScientificStudyBridgeOutput(parsed)
  assertOutputParity({ study: input.study, training: input.training, output })
  return {
    requestPath,
    requestContractSha256: requestContractSha256(request),
    outputPath,
    outputContractSha256: canonicalJsonV1Sha256(output),
    output,
  }
}

export const STUDY_EVAL_BRIDGE_DETERMINISM_ENV = M1_DETERMINISM_ENV
