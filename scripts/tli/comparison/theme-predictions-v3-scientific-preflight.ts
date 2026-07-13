import { compareUtf8Bytes } from '../../../lib/tli/canonical-json'
import {
  ScientificScoringCriticalIncidentError,
  parseScientificIntervalReplayEvidence,
} from './theme-predictions-v3-scientific-interval'
import {
  assertBeforeScientificFinalization,
  assertReadyAtScientificPredictionInsert,
  exactScientificRow,
  failScientificScoringContract,
  isActiveScientificCycleStatus,
  matchingScientificAttestation,
  parseScientificTime,
} from './theme-predictions-v3-scientific-preflight-contract'
import {
  buildScientificScoreFinalization,
  findExactScientificLabel,
  resolveTerminalScientificLabel,
  validateScientificPrediction,
} from './theme-predictions-v3-scientific-preflight-finalization'
import type {
  ScientificPredictionScoringInput,
  ScientificPredictionScoringPlan,
  ScientificScoreFinalization,
} from './theme-predictions-v3-scientific-types'

const verifiedScoringPlans = new WeakSet<object>()

export { ScientificScoringContractError } from './theme-predictions-v3-scientific-preflight-contract'

export function assertVerifiedScientificPredictionScoringPlan(
  plan: unknown,
): asserts plan is ScientificPredictionScoringPlan {
  if (typeof plan !== 'object' || plan === null || !verifiedScoringPlans.has(plan)) {
    throw new ScientificScoringCriticalIncidentError('scientific_scoring_plan_unverified', null)
  }
}

export function buildScientificPredictionScoringPlan(
  input: ScientificPredictionScoringInput,
): ScientificPredictionScoringPlan {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.scoredAt)) {
    failScientificScoringContract('scoredAt must be canonical UTC with millisecond precision')
  }
  const cycle = exactScientificRow(input.cycles.filter((row) => row.id === input.requestedCycleId), 'requested cycle')
  const origin = exactScientificRow(input.origins.filter((row) => row.id === input.requestedOriginId), 'requested origin')
  if (!isActiveScientificCycleStatus(cycle.status) || origin.cycle_id !== cycle.id
    || origin.candidate_model_sha256 !== cycle.candidate_model_sha256
    || origin.comparator_artifact_sha256 !== cycle.comparator_artifact_sha256) {
    failScientificScoringContract('requested experiment cycle/origin is inactive or hash-mismatched')
  }
  const study = exactScientificRow(input.studyOrigins.filter((row) => row.id === origin.study_origin_manifest_id), 'study origin')
  const forecast = exactScientificRow(input.forecasts.filter((row) => row.id === origin.forecast_origin_manifest_id), 'forecast origin')
  if (study.study_contract_id !== cycle.study_contract_id
    || study.forecast_origin_manifest_id !== forecast.id) failScientificScoringContract('experiment study/forecast foundation mismatch')
  const themes = [...forecast.expected_theme_ids].sort(compareUtf8Bytes)
  if (forecast.expected_theme_count !== themes.length || new Set(themes).size !== themes.length || themes.length === 0) {
    failScientificScoringContract('forecast expected theme universe is incomplete or duplicated')
  }

  const originArtifact = exactScientificRow(input.evidenceArtifacts.filter((row) => (
    row.cycle_id === cycle.id && row.experiment_origin_manifest_id === origin.id
    && row.artifact_type === 'origin_manifest' && row.artifact_key === forecast.origin_date
  )), 'matching origin artifact')
  const originAttestation = matchingScientificAttestation(originArtifact, input.evidenceAttestations)
  const modelArtifact = exactScientificRow(input.evidenceArtifacts.filter((row) => (
    row.cycle_id === cycle.id && row.experiment_origin_manifest_id === null
    && row.artifact_type === 'model_manifest' && row.artifact_key === 'singleton'
  )), 'frozen model manifest')
  const modelAttestation = matchingScientificAttestation(modelArtifact, input.evidenceAttestations)
  const frozenInterval = parseScientificIntervalReplayEvidence(cycle, modelArtifact)

  const scopedPredictions = input.predictions.filter((row) => (
    row.experiment_cycle_id === cycle.id && row.experiment_origin_manifest_id === origin.id
  ))
  const finalizations: ScientificScoreFinalization[] = []
  let intervalEligibleCount = 0
  let intervalCompleteCount = 0
  for (const themeId of themes) {
    const themeRows = scopedPredictions.filter((row) => row.theme_id === themeId)
    if (themeRows.length !== 2) failScientificScoringContract(`theme ${themeId} requires exactly two scientific role rows`)
    const label = findExactScientificLabel(input, themeId, forecast.id, forecast.origin_date, cycle.labeler_version)
    const terminal = resolveTerminalScientificLabel(label)
    const finalizedAt = label.finalized_at ?? failScientificScoringContract(`label ${label.id} is not finalized`)
    if (parseScientificTime(input.scoredAt, 'scoredAt') < parseScientificTime(finalizedAt, 'label finalized_at')) {
      failScientificScoringContract('scientific scoring time must follow exact label finalization')
    }
    assertBeforeScientificFinalization(originArtifact.created_at, finalizedAt, 'origin artifact created_at')
    assertBeforeScientificFinalization(originAttestation.verified_at, finalizedAt, 'origin attestation verified_at')
    assertBeforeScientificFinalization(modelArtifact.created_at, finalizedAt, 'interval model manifest created_at')
    assertBeforeScientificFinalization(modelAttestation.verified_at, finalizedAt, 'interval attestation verified_at')
    const rowsByRole = (['candidate', 'comparator'] as const).map((role) => ({
      role,
      row: exactScientificRow(themeRows.filter((row) => row.scientific_prediction_role === role), `theme ${themeId} ${role}`),
    }))
    if (rowsByRole[0].row.feature_snapshot_hash !== rowsByRole[1].row.feature_snapshot_hash) {
      failScientificScoringContract(`theme ${themeId} feature snapshot hash differs by role`)
    }
    for (const { role, row } of rowsByRole) {
      assertReadyAtScientificPredictionInsert(originArtifact.created_at, row.created_at, 'origin artifact created_at')
      assertReadyAtScientificPredictionInsert(originAttestation.verified_at, row.created_at, 'origin attestation verified_at')
      assertReadyAtScientificPredictionInsert(modelArtifact.created_at, row.created_at, 'interval model manifest created_at')
      assertReadyAtScientificPredictionInsert(modelAttestation.verified_at, row.created_at, 'interval attestation verified_at')
      const verifiedPrediction = validateScientificPrediction({
        row, role, cycle, forecastDate: forecast.origin_date,
        forecastId: forecast.id, forecastCutoff: forecast.forecast_cutoff,
        finalizedAt, intervalReplay: frozenInterval,
      })
      intervalEligibleCount += verifiedPrediction.intervalEligibleCount
      intervalCompleteCount += verifiedPrediction.intervalCompleteCount
      finalizations.push(buildScientificScoreFinalization({
        prediction: verifiedPrediction, label, role, status: terminal.status,
        reason: terminal.reason, scoredAt: input.scoredAt,
      }))
    }
  }
  if (scopedPredictions.length !== themes.length * 2) {
    failScientificScoringContract('requested origin contains rows outside the exact expected universe')
  }
  const immutableFinalizations = Object.freeze(finalizations.map((item) => Object.freeze(item)))
  const plan: ScientificPredictionScoringPlan = Object.freeze({
    cycleId: cycle.id,
    originId: origin.id,
    expectedThemeCount: themes.length,
    intervalEligibleCount,
    intervalCompleteCount,
    intervalEvidence: frozenInterval.receipt,
    finalizations: immutableFinalizations,
  })
  verifiedScoringPlans.add(plan)
  return plan
}
