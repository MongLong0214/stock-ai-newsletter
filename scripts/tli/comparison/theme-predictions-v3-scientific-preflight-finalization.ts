import { canonicalJsonV1, canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import {
  ScientificIntervalContractVerifiedPrediction,
  parseScientificIntervalReplayEvidence,
} from './theme-predictions-v3-scientific-interval'
import {
  assertBeforeScientificFinalization,
  exactScientificRow,
  failScientificScoringContract,
  isScientificSha256,
  scientificRoleContract,
} from './theme-predictions-v3-scientific-preflight-contract'
import type {
  ScientificCycleRow,
  ScientificLabelRow,
  ScientificPredictionRole,
  ScientificPredictionRow,
  ScientificPredictionScoringInput,
  ScientificScoreFinalization,
} from './theme-predictions-v3-scientific-types'

export const validateScientificPrediction = (input: {
  readonly row: ScientificPredictionRow
  readonly role: ScientificPredictionRole
  readonly cycle: ScientificCycleRow
  readonly forecastDate: string
  readonly forecastId: string
  readonly forecastCutoff: string
  readonly finalizedAt: string
  readonly intervalReplay: ReturnType<typeof parseScientificIntervalReplayEvidence>
}): ScientificIntervalContractVerifiedPrediction => {
  const expected = scientificRoleContract(input.cycle, input.role)
  const row = input.row
  if (
    row.scientific_prediction_role !== input.role || row.serving_role !== 'shadow'
    || row.score_status !== 'pending' || row.model_version !== expected.modelVersion
    || row.model_artifact_sha256 !== expected.modelSha
    || row.feature_contract_hash !== input.cycle.feature_contract_sha256
    || !isScientificSha256(row.feature_snapshot_hash)
    || canonicalJsonV1Sha256(row.features) !== row.feature_snapshot_hash
    || row.prediction_date !== input.forecastDate || row.forecast_origin_week !== input.forecastDate
    || row.forecast_cutoff !== input.forecastCutoff || row.horizon_days !== 5
    || row.labeler_version !== input.cycle.labeler_version
  ) failScientificScoringContract(`prediction ${row.id} role/model/feature/cutoff contract is not exact`)
  assertBeforeScientificFinalization(row.created_at, input.finalizedAt, `prediction ${row.id} created_at`)
  return ScientificIntervalContractVerifiedPrediction.verify(row, input.role, input.intervalReplay, {
    featureContractSha256: input.cycle.feature_contract_sha256,
    forecastOriginManifestId: input.forecastId,
    themeId: row.theme_id,
    cutoffAt: input.forecastCutoff,
  })
}

export const findExactScientificLabel = (
  input: ScientificPredictionScoringInput,
  themeId: string,
  forecastId: string,
  forecastDate: string,
  labelerVersion: string,
): ScientificLabelRow => exactScientificRow(input.labels.filter((label) => (
  label.theme_id === themeId && label.base_date === forecastDate && label.horizon_days === 5
  && label.labeler_version === labelerVersion && label.label_type === 'gt_a'
  && label.forecast_origin_manifest_id === forecastId
)), `theme ${themeId} exact label`)

export const resolveTerminalScientificLabel = (
  label: ScientificLabelRow,
): { status: 'scored' | 'excluded'; reason: string | null } => {
  if (label.finalized_at === null) failScientificScoringContract(`label ${label.id} is not finalized`)
  if (label.label_status === 'final') {
    if (
      label.scientific_use_status !== 'confirmatory_eligible'
      || label.y_binary === null || label.g_log_ratio === null || !Number.isFinite(label.g_log_ratio)
    ) failScientificScoringContract(`label ${label.id} final outcome is null or ineligible`)
    return { status: 'scored', reason: null }
  }
  if (label.label_status !== 'excluded' || label.exclude_reason === null) {
    failScientificScoringContract(`label ${label.id} is not an allowed terminal label`)
  }
  return { status: 'excluded', reason: label.exclude_reason }
}

export const buildScientificScoreFinalization = (input: {
  readonly prediction: ScientificIntervalContractVerifiedPrediction
  readonly label: ScientificLabelRow
  readonly role: ScientificPredictionRole
  readonly status: 'scored' | 'excluded'
  readonly reason: string | null
  readonly scoredAt: string
}): ScientificScoreFinalization => {
  const payload = {
    prediction_id: input.prediction.row.id,
    actual_label_id: input.label.id,
    score_status: input.status,
    score_exclusion_reason: input.reason,
    scored_at: input.scoredAt,
  }
  const canonicalJson = canonicalJsonV1(payload)
  return {
    predictionId: input.prediction.row.id,
    role: input.role,
    actualLabelId: input.label.id,
    scoreStatus: input.status,
    scoreExclusionReason: input.reason,
    canonicalJson,
    payloadSha256: canonicalJsonV1Sha256(payload),
  }
}
