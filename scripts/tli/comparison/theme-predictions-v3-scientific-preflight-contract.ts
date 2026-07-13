import type {
  ScientificCycleRow,
  ScientificEvidenceArtifactRow,
  ScientificEvidenceAttestationRow,
  ScientificPredictionRole,
} from './theme-predictions-v3-scientific-types'

const SCIENTIFIC_SHA256 = /^[0-9a-f]{64}$/
const ACTIVE_SCIENTIFIC_CYCLE_STATUSES = new Set([
  'running',
  'promoted_internal',
  'public_approved',
])

export const isScientificSha256 = (value: string): boolean => SCIENTIFIC_SHA256.test(value)

export const isActiveScientificCycleStatus = (value: string): boolean => (
  ACTIVE_SCIENTIFIC_CYCLE_STATUSES.has(value)
)

export class ScientificScoringContractError extends Error {
  readonly name = 'ScientificScoringContractError'
}

export const failScientificScoringContract = (message: string): never => {
  throw new ScientificScoringContractError(message)
}

export const exactScientificRow = <T>(rows: readonly T[], message: string): T => {
  if (rows.length !== 1) {
    failScientificScoringContract(`${message}: expected exactly one row, received ${rows.length}`)
  }
  const row = rows.at(0)
  return row ?? failScientificScoringContract(`${message}: row disappeared`)
}

export const parseScientificTime = (value: string, field: string): number => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
    ? parsed
    : failScientificScoringContract(`${field} must be a finite timestamp`)
}

export const assertBeforeScientificFinalization = (
  value: string,
  finalizedAt: string,
  field: string,
): void => {
  if (parseScientificTime(value, field) >= parseScientificTime(finalizedAt, 'label finalized_at')) {
    failScientificScoringContract(`${field} must be before exact label finalization`)
  }
}

export const assertReadyAtScientificPredictionInsert = (
  value: string,
  predictionCreatedAt: string,
  field: string,
): void => {
  if (parseScientificTime(value, field) > parseScientificTime(predictionCreatedAt, 'prediction created_at')) {
    failScientificScoringContract(`${field} must exist at prediction insert`)
  }
}

export const matchingScientificAttestation = (
  artifact: ScientificEvidenceArtifactRow,
  attestations: readonly ScientificEvidenceAttestationRow[],
): ScientificEvidenceAttestationRow => exactScientificRow(attestations.filter((row) => (
  row.artifact_id === artifact.id && row.content_sha256 === artifact.content_sha256
)), `${artifact.artifact_type} attestation`)

export const scientificRoleContract = (
  cycle: ScientificCycleRow,
  role: ScientificPredictionRole,
) => role === 'candidate'
  ? { modelVersion: cycle.candidate_model_version, modelSha: cycle.candidate_model_sha256 }
  : { modelVersion: cycle.comparator_version, modelSha: cycle.comparator_artifact_sha256 }
