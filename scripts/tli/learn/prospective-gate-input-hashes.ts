import type { FrozenHashes } from './prospective-gate-contract'
import type { ProspectiveGateSource } from './prospective-gate-input-contract'

const observedHash = (expected: string, values: readonly string[]): string => (
  values.length > 0 && values.every((value) => value === expected) ? expected : '0'.repeat(64)
)

export const resolveFrozenGateHashes = (source: ProspectiveGateSource): {
  readonly observed: FrozenHashes
  readonly expected: FrozenHashes
} => {
  const cycle = source.cycle
  const expected: FrozenHashes = {
    studyContractSha256: cycle.study_contract_sha256,
    candidateModelSha256: cycle.candidate_model_sha256,
    comparatorArtifactSha256: cycle.comparator_artifact_sha256,
    datasetManifestSha256: cycle.dataset_manifest_sha256,
    featureContractSha256: cycle.feature_contract_sha256,
    labelContractSha256: cycle.label_contract_sha256,
    calibrationArtifactSha256: cycle.calibration_artifact_sha256,
  }
  const plannedOrigins = source.origins.filter((origin) => (
    origin.enrollment_role === 'confirmatory' && origin.sequence_no <= source.cycle.planned_origins
  ))
  const plannedOriginIds = new Set(plannedOrigins.map((origin) => origin.id))
  const plannedPredictions = source.predictions.filter((row) => plannedOriginIds.has(row.experiment_origin_manifest_id))
  const candidateRows = plannedPredictions.filter((row) => row.scientific_prediction_role === 'candidate')
  const comparatorRows = plannedPredictions.filter((row) => row.scientific_prediction_role === 'comparator')
  return {
    expected,
    observed: {
      ...expected,
      candidateModelSha256: observedHash(expected.candidateModelSha256, [
        ...plannedOrigins.map((row) => row.candidate_model_sha256),
        ...candidateRows.map((row) => row.model_artifact_sha256),
      ]),
      comparatorArtifactSha256: observedHash(expected.comparatorArtifactSha256, [
        ...plannedOrigins.map((row) => row.comparator_artifact_sha256),
        ...comparatorRows.map((row) => row.model_artifact_sha256),
      ]),
      featureContractSha256: observedHash(
        expected.featureContractSha256,
        plannedPredictions.map((row) => row.feature_contract_hash),
      ),
    },
  }
}
