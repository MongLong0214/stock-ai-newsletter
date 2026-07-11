import { createHash } from 'node:crypto'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import type { ConfirmatoryFeatureSnapshot } from '../../../lib/tli/features/build-confirmatory-features'
import type { ReplicateBody } from '../../../lib/tli/model/interval-replay'
import type { M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import {
  buildScientificPredictionScoringPlan,
  executeScientificPredictionScoringPlan,
  type ScientificPredictionRow,
} from '../comparison/theme-predictions-v3-scientific-scoring'
import {
  CYCLE_ID,
  COMPARATOR_ARTIFACT_SHA256,
  FEATURE_CONTRACT_SHA256,
  STUDY_CONTRACT_ID,
  THEME_IDS,
  deterministicUuid,
  experimentOriginId,
  scientificPredictionId,
} from './fixture-identities'
import type { FixtureOriginRef } from './fixture-origins'
import { buildFixtureGtAV2LabelSeed } from './fixture-labels'
import { assertProspectiveReplayBytes } from './prospective-replay-verification'
import type { ProspectiveScoringReceipt, ProspectiveScoringRow } from './prospective-scoring-contract'

const featuresBody = (snapshot: ConfirmatoryFeatureSnapshot): Readonly<Record<string, unknown>> => ({
  featureNames: snapshot.featureNames,
  values: snapshot.values,
  missingFlags: snapshot.missingFlags,
  abstain: snapshot.abstain,
  abstainReasons: snapshot.abstainReasons,
  provenance: snapshot.provenance,
})

const afterCutoff = (forecastCutoff: string, milliseconds: number): string => (
  new Date(Date.parse(forecastCutoff) + milliseconds).toISOString()
)

// Candidate rows carry the replayed block_bootstrap_envelope_v1 from the frozen 500-model ensemble
// (computed once at panel build); the climatology comparator has no ensemble, so its interval is its point.
const scoringInterval = (row: ProspectiveScoringRow, role: 'candidate' | 'comparator'): {
  readonly lower: number
  readonly upper: number
} => (
  role === 'comparator'
    ? { lower: row.comparatorProbability, upper: row.comparatorProbability }
    : { lower: row.candidateCiLower, upper: row.candidateCiUpper }
)

const scoringPrediction = (input: {
  readonly row: ProspectiveScoringRow
  readonly originId: string
  readonly role: 'candidate' | 'comparator'
  readonly artifactSha256: string
}): ScientificPredictionRow => {
  const interval = scoringInterval(input.row, input.role)
  return {
    id: scientificPredictionId(input.originId, input.row.themeId, input.role),
    experiment_cycle_id: CYCLE_ID,
    experiment_origin_manifest_id: input.originId,
    theme_id: input.row.themeId,
    prediction_date: input.row.origin.originDate,
    horizon_days: 5,
    serving_role: 'shadow',
    scientific_prediction_role: input.role,
    model_version: input.role === 'candidate' ? 'scientific-m1-v2' : 'balanced-climatology-v1',
    model_artifact_sha256: input.artifactSha256,
    feature_contract_hash: FEATURE_CONTRACT_SHA256,
    feature_snapshot_hash: input.row.snapshot.featureSnapshotSha256,
    features: featuresBody(input.row.snapshot),
    forecast_cutoff: input.row.origin.forecastCutoff,
    forecast_origin_week: input.row.origin.originDate,
    labeler_version: 'gta-v2',
    p_rise: input.role === 'candidate' ? input.row.candidateProbability : input.row.comparatorProbability,
    ci_lower: interval.lower,
    ci_upper: interval.upper,
    abstain: false,
    score_status: 'pending',
    created_at: afterCutoff(input.row.origin.forecastCutoff, 60_000),
  }
}

export async function scoreProspectiveOrigin(input: {
  readonly origin: FixtureOriginRef
  readonly rows: readonly ProspectiveScoringRow[]
  readonly artifact: M1ModelArtifactV2
  readonly artifactJson: string
  readonly artifactSha256: string
  readonly intervalEnsembleSha256: string
  readonly intervalEnsembleArtifact: unknown
  readonly replicateBodies: readonly ReplicateBody[]
  readonly modelCreatedAt: string
  readonly modelArtifactId: string
}): Promise<ProspectiveScoringReceipt> {
  const replayEnvelopeChecks = assertProspectiveReplayBytes(input)
  const originId = experimentOriginId(CYCLE_ID, input.origin.originDate)
  const originArtifactId = deterministicUuid('origin-artifact', originId)
  const originArtifactPayload = {
    origin_date: input.origin.originDate,
    forecast_cutoff: input.origin.forecastCutoff,
    forecast_origin_manifest_id: input.origin.forecastManifestId,
    study_origin_manifest_id: input.origin.studyOriginManifestId,
  }
  const originArtifactHash = canonicalJsonV1Sha256(originArtifactPayload)
  const predictions = input.rows.flatMap((row) => [
    scoringPrediction({ row, originId, role: 'candidate', artifactSha256: input.artifactSha256 }),
    scoringPrediction({ row, originId, role: 'comparator', artifactSha256: COMPARATOR_ARTIFACT_SHA256 }),
  ])
  const modelPayload = {
    candidate_model_version: 'scientific-m1-v2',
    candidate_model_sha256: input.artifactSha256,
    comparator_version: 'balanced-climatology-v1',
    comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
    candidate_model_artifact_json: input.artifactJson,
    interval_ensemble_version: 'interval-ensemble-v2',
    interval_envelope_version: 'block_bootstrap_envelope_v1',
    interval_replicate_count: 500,
    interval_ensemble_sha256: input.intervalEnsembleSha256,
    interval_ensemble_artifact: input.intervalEnsembleArtifact,
  }
  const labels = input.rows.map((row) => {
    const seed = buildFixtureGtAV2LabelSeed({
      origin: input.origin,
      themeId: row.themeId,
      labelId: row.labelId,
    })
    const payload = seed.finalizerPayload
    if (
      payload.y_binary === null
      || payload.g_log_ratio === null
      || payload.y_binary !== row.outcome
      || seed.readbackRow.finalized_at !== row.finalizedAt
    ) {
      throw new Error(`prospective gta-v2 finalizer fixture mismatch for ${input.origin.originDate}:${row.themeId}`)
    }
    return {
      id: row.labelId,
      theme_id: payload.theme_id,
      base_date: payload.base_date,
      horizon_days: 5,
      labeler_version: 'gta-v2',
      label_type: 'gt_a',
      label_status: 'final',
      scientific_use_status: 'confirmatory_eligible',
      g_log_ratio: payload.g_log_ratio,
      y_binary: payload.y_binary,
      exclude_reason: null,
      forecast_origin_manifest_id: payload.forecast_origin_manifest_id,
      finalized_at: seed.readbackRow.finalized_at,
    }
  })
  const scoredAt = new Date(Math.max(...input.rows.map((row) => Date.parse(row.finalizedAt))) + 3_600_000).toISOString()
  const plan = buildScientificPredictionScoringPlan({
    requestedCycleId: CYCLE_ID,
    requestedOriginId: originId,
    scoredAt,
    cycles: [{
      id: CYCLE_ID,
      status: 'running',
      study_contract_id: STUDY_CONTRACT_ID,
      candidate_model_version: 'scientific-m1-v2',
      candidate_model_sha256: input.artifactSha256,
      comparator_version: 'balanced-climatology-v1',
      comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
      feature_contract_sha256: FEATURE_CONTRACT_SHA256,
      labeler_version: 'gta-v2',
    }],
    origins: [{
      id: originId,
      cycle_id: CYCLE_ID,
      study_origin_manifest_id: input.origin.studyOriginManifestId,
      forecast_origin_manifest_id: input.origin.forecastManifestId,
      candidate_model_sha256: input.artifactSha256,
      comparator_artifact_sha256: COMPARATOR_ARTIFACT_SHA256,
    }],
    studyOrigins: [{
      id: input.origin.studyOriginManifestId,
      study_contract_id: STUDY_CONTRACT_ID,
      forecast_origin_manifest_id: input.origin.forecastManifestId,
    }],
    forecasts: [{
      id: input.origin.forecastManifestId,
      origin_date: input.origin.originDate,
      forecast_cutoff: input.origin.forecastCutoff,
      expected_theme_ids: THEME_IDS,
      expected_theme_count: THEME_IDS.length,
    }],
    evidenceArtifacts: [{
      id: input.modelArtifactId,
      cycle_id: CYCLE_ID,
      experiment_origin_manifest_id: null,
      artifact_type: 'model_manifest',
      artifact_key: 'singleton',
      content_sha256: canonicalJsonV1Sha256(modelPayload),
      payload: modelPayload,
      created_at: input.modelCreatedAt,
    }, {
      id: originArtifactId,
      cycle_id: CYCLE_ID,
      experiment_origin_manifest_id: originId,
      artifact_type: 'origin_manifest',
      artifact_key: input.origin.originDate,
      content_sha256: originArtifactHash,
      payload: originArtifactPayload,
      created_at: afterCutoff(input.origin.forecastCutoff, 30_000),
    }],
    evidenceAttestations: [{
      artifact_id: input.modelArtifactId,
      content_sha256: canonicalJsonV1Sha256(modelPayload),
      verified_at: input.modelCreatedAt,
    }, {
      artifact_id: originArtifactId,
      content_sha256: originArtifactHash,
      verified_at: afterCutoff(input.origin.forecastCutoff, 45_000),
    }],
    predictions,
    labels: [...labels, {
      id: deterministicUuid('v1-sentinel', input.origin.originDate),
      theme_id: THEME_IDS[0] ?? '',
      base_date: input.origin.originDate,
      horizon_days: 5,
      labeler_version: 'gta-v1',
      label_type: 'gt_a',
      label_status: 'final',
      scientific_use_status: 'exploratory_only',
      g_log_ratio: 0,
      y_binary: false,
      exclude_reason: null,
      forecast_origin_manifest_id: input.origin.forecastManifestId,
      finalized_at: input.rows.at(0)?.finalizedAt ?? null,
    }],
  })
  const execution = await executeScientificPredictionScoringPlan(plan, async (request) => {
    const digest = createHash('sha256').update(request.canonicalJson).digest('hex')
    if (digest !== request.payloadSha256) throw new Error('scientific score finalization hash mismatch')
  })
  const predictionById = new Map(predictions.map((prediction) => [prediction.id, prediction]))
  const labelById = new Map(labels.map((label) => [label.id, label]))
  const rolesByTheme = new Map<string, Set<string>>()
  for (const finalization of plan.finalizations) {
    const prediction = predictionById.get(finalization.predictionId)
    if (prediction !== undefined) {
      const roles = rolesByTheme.get(prediction.theme_id) ?? new Set<string>()
      roles.add(finalization.role)
      rolesByTheme.set(prediction.theme_id, roles)
    }
  }
  return {
    plannedFinalizations: execution.plannedFinalizations,
    completedFinalizations: execution.completedFinalizations,
    replayEnvelopeChecks,
    replayEnvelopeByteMatch: 'pass',
    crossCycleRoleJoinCount: plan.finalizations.filter((finalization) => {
      const prediction = predictionById.get(finalization.predictionId)
      return prediction === undefined
        || prediction.experiment_cycle_id !== CYCLE_ID
        || prediction.experiment_origin_manifest_id !== originId
    }).length,
    rolePairViolationCount: input.rows.filter((row) => {
      const roles = rolesByTheme.get(row.themeId)
      return roles?.size !== 2 || !roles.has('candidate') || !roles.has('comparator')
    }).length,
    featureSnapshotMismatchCount: input.rows.filter((row) => predictions
      .filter((prediction) => prediction.theme_id === row.themeId)
      .some((prediction) => prediction.feature_snapshot_hash !== row.snapshot.featureSnapshotSha256)).length,
    v1MixCount: plan.finalizations.filter((finalization) => !labelById.has(finalization.actualLabelId)).length,
    nullToFalseCount: plan.finalizations.filter((finalization) => (
      labelById.get(finalization.actualLabelId)?.y_binary === null
    )).length,
  }
}
