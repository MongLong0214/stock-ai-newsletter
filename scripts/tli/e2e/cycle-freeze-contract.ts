import { createHash } from 'node:crypto'

import {
  canonicalJsonV1,
  canonicalJsonV1Sha256,
  parseCanonicalJsonV1,
  type JsonObject,
  type JsonValue,
} from '../../../lib/tli/canonical-json'
import {
  COMPARATOR_ARTIFACT_SHA256,
  CYCLE_ID,
  FEATURE_CONTRACT_SHA256,
  FEATURE_CONTRACT_VERSION,
  LABEL_CONTRACT_SHA256,
  STUDY_CONTRACT_ID,
} from './fixture-identities'
import type { FixtureOriginStack } from './fixture-origins'
const GIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
const VERIFIER_CODE_SHA256 = canonicalJsonV1Sha256({
  contract: 'todo-15-local-evidence-verifier-v1',
})
const isJsonObject = (value: JsonValue): value is JsonObject => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)
const canonicalObject = (value: unknown): JsonObject => {
  const parsed = parseCanonicalJsonV1(canonicalJsonV1(value))
  if (!isJsonObject(parsed)) {
    throw new TypeError('cycle freeze contract requires a canonical JSON object')
  }
  return parsed
}
const gitBlobSha1 = (canonicalJson: string): string => {
  const bytes = Buffer.from(canonicalJson, 'utf8')
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, 'utf8'))
    .update(bytes)
    .digest('hex')
}
const requireGitCommitSha = (gitCommitSha: string): void => {
  if (!GIT_SHA_PATTERN.test(gitCommitSha)) {
    throw new TypeError('cycle freeze fixture requires a lowercase Git commit SHA')
  }
}

export interface StudyLockContract {
  readonly controlRowId: string
  readonly controlVersion: string
  readonly payload: JsonObject
  readonly payloadSha256: string
  readonly lockedAt: string
  readonly gitCommitSha: string
  readonly gitBlobSha: string
  readonly repoRelativePath: string
  readonly verifierCodeSha256: string
}

export interface FreezeEvidenceEnvelope {
  readonly artifact_type: 'preregistration' | 'dataset_manifest' | 'model_manifest' | 'cycle_manifest'
  readonly artifact_key: 'singleton'
  readonly content_sha256: string
  readonly canonical_json: string
  readonly git_commit_sha: string
  readonly git_blob_sha: string
  readonly repo_relative_path: string
  readonly verifier_version: 'tli-local-fixture-verifier-v1'
  readonly verifier_code_sha: string
  readonly verified_at: string
  readonly payload: JsonObject
}

export interface CycleFreezeContract {
  readonly cycleId: typeof CYCLE_ID
  readonly plannedOrigins: 24
  readonly sourceDatasetManifestSha256: string
  readonly datasetManifestSha256: string
  readonly modelManifestSha256: string
  readonly cycleManifestSha256: string
  readonly cycleRow: JsonObject
  readonly evidenceEnvelopes: readonly FreezeEvidenceEnvelope[]
}

export const buildStudyLockContract = (input: {
  readonly stack: FixtureOriginStack
  readonly gitCommitSha: string
}): StudyLockContract => {
  requireGitCommitSha(input.gitCommitSha)
  const canonicalJson = canonicalJsonV1(input.stack.studyContractPayload)
  const payloadSha256 = canonicalJsonV1Sha256(input.stack.studyContractPayload)
  if (payloadSha256 !== input.stack.studyContractSha256) {
    throw new Error('study contract payload SHA does not match the origin stack')
  }
  return {
    controlRowId: String(input.stack.studyContractPayload.babl_control_row_id),
    controlVersion: String(input.stack.studyContractPayload.babl_algorithm_version),
    payload: input.stack.studyContractPayload,
    payloadSha256,
    lockedAt: input.stack.studyLockedAt,
    gitCommitSha: input.gitCommitSha,
    gitBlobSha: gitBlobSha1(canonicalJson),
    repoRelativePath: `docs/evidence/tli-v3-scientific-rebuild/studies/${STUDY_CONTRACT_ID}/study-contract.json`,
    verifierCodeSha256: VERIFIER_CODE_SHA256,
  }
}

const evidenceEnvelope = (input: {
  readonly type: FreezeEvidenceEnvelope['artifact_type']
  readonly cycleId: string
  readonly payload: JsonObject
  readonly gitCommitSha: string
  readonly verifiedAt: string
}): FreezeEvidenceEnvelope => {
  const canonicalJson = canonicalJsonV1(input.payload)
  return {
    artifact_type: input.type,
    artifact_key: 'singleton',
    content_sha256: canonicalJsonV1Sha256(input.payload),
    canonical_json: canonicalJson,
    git_commit_sha: input.gitCommitSha,
    git_blob_sha: gitBlobSha1(canonicalJson),
    repo_relative_path: `docs/evidence/tli-v3-scientific-rebuild/${input.cycleId}/${input.type.replace('_', '-')}.json`,
    verifier_version: 'tli-local-fixture-verifier-v1',
    verifier_code_sha: VERIFIER_CODE_SHA256,
    verified_at: input.verifiedAt,
    payload: input.payload,
  }
}

export const buildCycleFreezeContract = (input: {
  readonly stack: FixtureOriginStack
  readonly data: {
    readonly dataset: {
      readonly manifest: unknown
      readonly manifestSha256: string
    }
    readonly cutoff: string
  }
  readonly training: {
    readonly artifact: unknown
    readonly artifactSha256: string
    readonly calibrationArtifactSha256: string
    readonly intervalEnsembleSha256: string
    readonly report: { readonly promotionDecision: { readonly positiveSkill: boolean } }
  }
  readonly gitCommitSha: string
  readonly verifiedAt: string
}): CycleFreezeContract => {
  requireGitCommitSha(input.gitCommitSha)
  const firstOrigin = input.stack.prospectiveOrigins.at(0)
  const lastOrigin = input.stack.prospectiveOrigins.at(-1)
  if (firstOrigin === undefined || lastOrigin === undefined) {
    throw new Error('cycle freeze requires a non-empty prospective origin schedule')
  }

  const datasetPayload = canonicalObject({
    manifest_version: 'tli-cycle-dataset-manifest-v1',
    cycle_id: CYCLE_ID,
    study_contract_id: STUDY_CONTRACT_ID,
    study_contract_sha256: input.stack.studyContractSha256,
    source_dataset_manifest_sha256: input.data.dataset.manifestSha256,
    source_dataset_manifest: input.data.dataset.manifest,
    as_of_cutoff: input.data.cutoff,
    feature_contract_sha256: FEATURE_CONTRACT_SHA256,
    label_contract_sha256: LABEL_CONTRACT_SHA256,
  })
  const datasetManifestSha256 = canonicalJsonV1Sha256(datasetPayload)
  const artifact = canonicalObject(input.training.artifact)
  const modelPayload = canonicalObject({
    manifest_version: 'tli-cycle-model-manifest-v1',
    cycle_id: CYCLE_ID,
    study_contract_id: STUDY_CONTRACT_ID,
    study_contract_sha256: input.stack.studyContractSha256,
    dataset_manifest_sha256: datasetManifestSha256,
    candidate_model_version: 'scientific-m1-v2',
    candidate_model_sha256: input.training.artifactSha256,
    candidate_model_artifact: artifact,
    comparator_version: 'balanced-climatology-v1',
    comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
    calibration_artifact_sha256: input.training.calibrationArtifactSha256,
    interval_ensemble_sha256: input.training.intervalEnsembleSha256,
  })
  const modelManifestSha256 = canonicalJsonV1Sha256(modelPayload)
  const thresholds = canonicalObject({ paired_brier_upper_99_max: 0 })
  const powerSimulationResult = canonicalObject({ power: 0.9, data_floor_pass: true })
  const powerSimulationSha256 = canonicalJsonV1Sha256({
    cycle_id: CYCLE_ID,
    study_contract_sha256: input.stack.studyContractSha256,
    source_dataset_manifest_sha256: input.data.dataset.manifestSha256,
    planned_origins: 24,
    result: powerSimulationResult,
  })
  const common = {
    cycle_id: CYCLE_ID,
    study_contract_id: STUDY_CONTRACT_ID,
    study_contract_sha256: input.stack.studyContractSha256,
    dataset_manifest_sha256: datasetManifestSha256,
    candidate_model_version: 'scientific-m1-v2',
    candidate_model_sha256: input.training.artifactSha256,
    comparator_version: 'balanced-climatology-v1',
    comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
    feature_contract_version: FEATURE_CONTRACT_VERSION,
    feature_contract_sha256: FEATURE_CONTRACT_SHA256,
    labeler_version: 'gta-v2',
    label_contract_sha256: LABEL_CONTRACT_SHA256,
    calibration_version: 'platt-v1',
    calibration_artifact_sha256: input.training.calibrationArtifactSha256,
    babl_contract_sha256: String(input.stack.studyContractPayload.babl_control_sha256),
    primary_endpoint: 'paired_brier_delta',
    alpha: 0.01,
    thresholds,
    power_simulation_sha256: powerSimulationSha256,
    power_simulation_result: powerSimulationResult,
    planned_origins: 24,
    safety_origins: 8,
    calendar_start: firstOrigin.originDate,
    initial_calendar_end: lastOrigin.originDate,
  }
  const preregistrationPayload = canonicalObject(common)
  const preregistrationSha256 = canonicalJsonV1Sha256(preregistrationPayload)
  const cyclePayload = canonicalObject({
    manifest_version: 'tli-cycle-manifest-v1',
    ...common,
    model_manifest_sha256: modelManifestSha256,
    preregistration_sha256: preregistrationSha256,
    retrospective_positive_skill: input.training.report.promotionDecision.positiveSkill,
  })
  const verifiedAt = new Date(input.verifiedAt).toISOString()
  const evidenceEnvelopes = [
    evidenceEnvelope({ type: 'preregistration', cycleId: CYCLE_ID, payload: preregistrationPayload, gitCommitSha: input.gitCommitSha, verifiedAt }),
    evidenceEnvelope({ type: 'dataset_manifest', cycleId: CYCLE_ID, payload: datasetPayload, gitCommitSha: input.gitCommitSha, verifiedAt }),
    evidenceEnvelope({ type: 'model_manifest', cycleId: CYCLE_ID, payload: modelPayload, gitCommitSha: input.gitCommitSha, verifiedAt }),
    evidenceEnvelope({ type: 'cycle_manifest', cycleId: CYCLE_ID, payload: cyclePayload, gitCommitSha: input.gitCommitSha, verifiedAt }),
  ] as const
  return {
    cycleId: CYCLE_ID,
    plannedOrigins: 24,
    sourceDatasetManifestSha256: input.data.dataset.manifestSha256,
    datasetManifestSha256,
    modelManifestSha256,
    cycleManifestSha256: canonicalJsonV1Sha256(cyclePayload),
    cycleRow: canonicalObject({
      ...common,
      status: 'draft',
      preregistration_sha256: preregistrationSha256,
      preregistration_payload: preregistrationPayload,
    }),
    evidenceEnvelopes,
  }
}
