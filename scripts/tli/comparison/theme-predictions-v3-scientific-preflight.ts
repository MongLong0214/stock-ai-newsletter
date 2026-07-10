import { canonicalJsonV1, canonicalJsonV1Sha256, compareUtf8Bytes } from '../../../lib/tli/canonical-json'
import type {
  ScientificCycleRow,
  ScientificEvidenceArtifactRow,
  ScientificEvidenceAttestationRow,
  ScientificIntervalEvidence,
  ScientificLabelRow,
  ScientificPredictionRole,
  ScientificPredictionRow,
  ScientificPredictionScoringInput,
  ScientificPredictionScoringPlan,
  ScientificScoreFinalization,
} from './theme-predictions-v3-scientific-types'

const SHA256 = /^[0-9a-f]{64}$/
const ACTIVE_STATUSES = new Set(['running', 'promoted_internal', 'public_approved'])

export class ScientificScoringContractError extends Error {
  readonly name = 'ScientificScoringContractError'
}

const fail = (message: string): never => {
  throw new ScientificScoringContractError(message)
}

const exactOne = <T>(rows: readonly T[], message: string): T => {
  if (rows.length !== 1) fail(`${message}: expected exactly one row, received ${rows.length}`)
  const row = rows.at(0)
  return row ?? fail(`${message}: row disappeared`)
}

const parseTime = (value: string, field: string): number => {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fail(`${field} must be a finite timestamp`)
}

const assertBeforeFinalization = (value: string, finalizedAt: string, field: string): void => {
  if (parseTime(value, field) >= parseTime(finalizedAt, 'label finalized_at')) {
    fail(`${field} must be before exact label finalization`)
  }
}

const assertReadyAtPredictionInsert = (
  value: string,
  predictionCreatedAt: string,
  field: string,
): void => {
  if (parseTime(value, field) > parseTime(predictionCreatedAt, 'prediction created_at')) {
    fail(`${field} must exist at prediction insert`)
  }
}

const matchingAttestation = (
  artifact: ScientificEvidenceArtifactRow,
  attestations: readonly ScientificEvidenceAttestationRow[],
): ScientificEvidenceAttestationRow => exactOne(attestations.filter((row) => (
  row.artifact_id === artifact.id && row.content_sha256 === artifact.content_sha256
)), `${artifact.artifact_type} attestation`)

const intervalEvidence = (
  cycle: ScientificCycleRow,
  artifact: ScientificEvidenceArtifactRow,
): ScientificIntervalEvidence => {
  const payload = artifact.payload
  if (
    payload.candidate_model_version !== cycle.candidate_model_version
    || payload.candidate_model_sha256 !== cycle.candidate_model_sha256
    || payload.comparator_version !== cycle.comparator_version
    || payload.comparator_artifact_sha256 !== cycle.comparator_artifact_sha256
  ) fail('model manifest does not match the frozen role model identities')
  if (
    payload.interval_ensemble_version !== 'interval-ensemble-v2'
    || payload.interval_envelope_version !== 'block_bootstrap_envelope_v1'
    || payload.interval_replicate_count !== 500
  ) fail('interval model manifest requires the frozen exact 500-model ensemble')
  const ensembleSha256 = typeof payload.interval_ensemble_sha256 === 'string'
    ? payload.interval_ensemble_sha256
    : fail('interval ensemble hash must be lowercase SHA-256')
  if (!SHA256.test(ensembleSha256)) {
    fail('interval ensemble hash must be lowercase SHA-256')
  }
  return {
    ensembleVersion: 'interval-ensemble-v2',
    envelopeVersion: 'block_bootstrap_envelope_v1',
    replicateCount: 500,
    ensembleSha256,
  }
}

const assertInterval = (prediction: ScientificPredictionRow): number => {
  if (prediction.abstain) return 0
  const { p_rise: probability, ci_lower: lower, ci_upper: upper } = prediction
  if (
    probability === null || lower === null || upper === null
    || !Number.isFinite(probability) || !Number.isFinite(lower) || !Number.isFinite(upper)
    || lower < 0 || lower > probability || probability > upper || upper > 1
  ) fail(`prediction ${prediction.id} interval must satisfy 0 <= lower <= p <= upper <= 1`)
  return 1
}

const roleContract = (cycle: ScientificCycleRow, role: ScientificPredictionRole) => role === 'candidate'
  ? { modelVersion: cycle.candidate_model_version, modelSha: cycle.candidate_model_sha256 }
  : { modelVersion: cycle.comparator_version, modelSha: cycle.comparator_artifact_sha256 }

const validatePrediction = (input: {
  readonly row: ScientificPredictionRow
  readonly role: ScientificPredictionRole
  readonly cycle: ScientificCycleRow
  readonly forecastDate: string
  readonly forecastCutoff: string
  readonly finalizedAt: string
}): number => {
  const expected = roleContract(input.cycle, input.role)
  const row = input.row
  if (
    row.scientific_prediction_role !== input.role || row.serving_role !== 'shadow'
    || row.score_status !== 'pending' || row.model_version !== expected.modelVersion
    || row.model_artifact_sha256 !== expected.modelSha
    || row.feature_contract_hash !== input.cycle.feature_contract_sha256
    || !SHA256.test(row.feature_snapshot_hash)
    || canonicalJsonV1Sha256(row.features) !== row.feature_snapshot_hash
    || row.prediction_date !== input.forecastDate || row.forecast_origin_week !== input.forecastDate
    || row.forecast_cutoff !== input.forecastCutoff || row.horizon_days !== 5
    || row.labeler_version !== input.cycle.labeler_version
  ) fail(`prediction ${row.id} role/model/feature/cutoff contract is not exact`)
  assertBeforeFinalization(row.created_at, input.finalizedAt, `prediction ${row.id} created_at`)
  return assertInterval(row)
}

const exactLabel = (
  input: ScientificPredictionScoringInput,
  themeId: string,
  forecastId: string,
  forecastDate: string,
  labelerVersion: string,
): ScientificLabelRow => exactOne(input.labels.filter((label) => (
  label.theme_id === themeId && label.base_date === forecastDate && label.horizon_days === 5
  && label.labeler_version === labelerVersion && label.label_type === 'gt_a'
  && label.forecast_origin_manifest_id === forecastId
)), `theme ${themeId} exact label`)

const terminalLabel = (label: ScientificLabelRow): { status: 'scored' | 'excluded'; reason: string | null } => {
  if (label.finalized_at === null) fail(`label ${label.id} is not finalized`)
  if (label.label_status === 'final') {
    if (
      label.scientific_use_status !== 'confirmatory_eligible'
      || label.y_binary === null || label.g_log_ratio === null || !Number.isFinite(label.g_log_ratio)
    ) fail(`label ${label.id} final outcome is null or ineligible`)
    return { status: 'scored', reason: null }
  }
  if (label.label_status !== 'excluded' || label.exclude_reason === null) {
    fail(`label ${label.id} is not an allowed terminal label`)
  }
  return { status: 'excluded', reason: label.exclude_reason }
}

const finalization = (input: {
  readonly prediction: ScientificPredictionRow
  readonly label: ScientificLabelRow
  readonly role: ScientificPredictionRole
  readonly status: 'scored' | 'excluded'
  readonly reason: string | null
  readonly scoredAt: string
}): ScientificScoreFinalization => {
  const payload = {
    prediction_id: input.prediction.id,
    actual_label_id: input.label.id,
    score_status: input.status,
    score_exclusion_reason: input.reason,
    scored_at: input.scoredAt,
  }
  const canonicalJson = canonicalJsonV1(payload)
  return {
    predictionId: input.prediction.id,
    role: input.role,
    actualLabelId: input.label.id,
    scoreStatus: input.status,
    scoreExclusionReason: input.reason,
    canonicalJson,
    payloadSha256: canonicalJsonV1Sha256(payload),
  }
}

export function buildScientificPredictionScoringPlan(
  input: ScientificPredictionScoringInput,
): ScientificPredictionScoringPlan {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.scoredAt)) {
    fail('scoredAt must be canonical UTC with millisecond precision')
  }
  const cycle = exactOne(input.cycles.filter((row) => row.id === input.requestedCycleId), 'requested cycle')
  const origin = exactOne(input.origins.filter((row) => row.id === input.requestedOriginId), 'requested origin')
  if (!ACTIVE_STATUSES.has(cycle.status) || origin.cycle_id !== cycle.id
    || origin.candidate_model_sha256 !== cycle.candidate_model_sha256
    || origin.comparator_artifact_sha256 !== cycle.comparator_artifact_sha256) {
    fail('requested experiment cycle/origin is inactive or hash-mismatched')
  }
  const study = exactOne(input.studyOrigins.filter((row) => row.id === origin.study_origin_manifest_id), 'study origin')
  const forecast = exactOne(input.forecasts.filter((row) => row.id === origin.forecast_origin_manifest_id), 'forecast origin')
  if (study.study_contract_id !== cycle.study_contract_id
    || study.forecast_origin_manifest_id !== forecast.id) fail('experiment study/forecast foundation mismatch')
  const themes = [...forecast.expected_theme_ids].sort(compareUtf8Bytes)
  if (forecast.expected_theme_count !== themes.length || new Set(themes).size !== themes.length || themes.length === 0) {
    fail('forecast expected theme universe is incomplete or duplicated')
  }

  const originArtifact = exactOne(input.evidenceArtifacts.filter((row) => (
    row.cycle_id === cycle.id && row.experiment_origin_manifest_id === origin.id
    && row.artifact_type === 'origin_manifest' && row.artifact_key === forecast.origin_date
  )), 'matching origin artifact')
  const originAttestation = matchingAttestation(originArtifact, input.evidenceAttestations)
  const modelArtifact = exactOne(input.evidenceArtifacts.filter((row) => (
    row.cycle_id === cycle.id && row.experiment_origin_manifest_id === null
    && row.artifact_type === 'model_manifest' && row.artifact_key === 'singleton'
  )), 'frozen model manifest')
  const modelAttestation = matchingAttestation(modelArtifact, input.evidenceAttestations)
  const frozenInterval = intervalEvidence(cycle, modelArtifact)

  const scopedPredictions = input.predictions.filter((row) => (
    row.experiment_cycle_id === cycle.id && row.experiment_origin_manifest_id === origin.id
  ))
  const finalizations: ScientificScoreFinalization[] = []
  let intervalCompleteCount = 0
  for (const themeId of themes) {
    const themeRows = scopedPredictions.filter((row) => row.theme_id === themeId)
    if (themeRows.length !== 2) fail(`theme ${themeId} requires exactly two scientific role rows`)
    const label = exactLabel(input, themeId, forecast.id, forecast.origin_date, cycle.labeler_version)
    const terminal = terminalLabel(label)
    const finalizedAt = label.finalized_at ?? fail(`label ${label.id} is not finalized`)
    if (parseTime(input.scoredAt, 'scoredAt') < parseTime(finalizedAt, 'label finalized_at')) {
      fail('scientific scoring time must follow exact label finalization')
    }
    assertBeforeFinalization(originArtifact.created_at, finalizedAt, 'origin artifact created_at')
    assertBeforeFinalization(originAttestation.verified_at, finalizedAt, 'origin attestation verified_at')
    assertBeforeFinalization(modelArtifact.created_at, finalizedAt, 'interval model manifest created_at')
    assertBeforeFinalization(modelAttestation.verified_at, finalizedAt, 'interval attestation verified_at')
    const rowsByRole = (['candidate', 'comparator'] as const).map((role) => ({
      role,
      row: exactOne(themeRows.filter((row) => row.scientific_prediction_role === role), `theme ${themeId} ${role}`),
    }))
    if (rowsByRole[0].row.feature_snapshot_hash !== rowsByRole[1].row.feature_snapshot_hash) {
      fail(`theme ${themeId} feature snapshot hash differs by role`)
    }
    for (const { role, row } of rowsByRole) {
      assertReadyAtPredictionInsert(originArtifact.created_at, row.created_at, 'origin artifact created_at')
      assertReadyAtPredictionInsert(originAttestation.verified_at, row.created_at, 'origin attestation verified_at')
      assertReadyAtPredictionInsert(modelArtifact.created_at, row.created_at, 'interval model manifest created_at')
      assertReadyAtPredictionInsert(modelAttestation.verified_at, row.created_at, 'interval attestation verified_at')
      intervalCompleteCount += validatePrediction({
        row, role, cycle, forecastDate: forecast.origin_date,
        forecastCutoff: forecast.forecast_cutoff, finalizedAt,
      })
      finalizations.push(finalization({
        prediction: row, label, role, status: terminal.status,
        reason: terminal.reason, scoredAt: input.scoredAt,
      }))
    }
  }
  if (scopedPredictions.length !== themes.length * 2) fail('requested origin contains rows outside the exact expected universe')
  return {
    cycleId: cycle.id,
    originId: origin.id,
    expectedThemeCount: themes.length,
    intervalCompleteCount,
    intervalEvidence: frozenInterval,
    finalizations,
  }
}
