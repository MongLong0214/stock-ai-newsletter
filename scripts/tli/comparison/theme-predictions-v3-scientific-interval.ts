import { z } from 'zod'

import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json'
import {
  INTERVAL_REPLICATE_COUNT,
  IntervalReplayError,
  assertReplayedEnvelope,
  type ReplicateBody,
} from '../../../lib/tli/model/interval-replay'
import { predictM1Probability, type M1ModelArtifactV2 } from '../../../lib/tli/model/m1'
import { parseM1ModelArtifact } from '../../../lib/tli/model/predict'
import type {
  ScientificCycleRow,
  ScientificEvidenceArtifactRow,
  ScientificIntervalEvidence,
  ScientificPredictionRole,
  ScientificPredictionRow,
} from './theme-predictions-v3-scientific-types'

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)
const replicateBodySchema = z.object({
  replicate_index: z.number().int().nonnegative(),
  scaler: z.object({
    median: z.array(z.number().finite()),
    mad: z.array(z.number().finite().nonnegative()),
  }).strict(),
  coefficients: z.object({
    intercept: z.number().finite(),
    weights: z.array(z.number().finite()),
  }).strict(),
  calibrator: z.object({ a: z.number().finite(), b: z.number().finite() }).strict(),
}).strict()
const intervalManifestSchema = z.object({
  candidate_model_version: z.string(),
  candidate_model_sha256: sha256Schema,
  comparator_version: z.string(),
  comparator_artifact_sha256: sha256Schema,
  candidate_model_artifact: z.unknown(),
  interval_ensemble_version: z.literal('interval-ensemble-v2'),
  interval_envelope_version: z.literal('block_bootstrap_envelope_v1'),
  interval_replicate_count: z.literal(INTERVAL_REPLICATE_COUNT),
  interval_ensemble_sha256: sha256Schema,
  interval_ensemble_artifact: z.unknown(),
})
const intervalEnsembleArtifactSchema = z.object({
  replicate_bodies: z.array(replicateBodySchema).length(INTERVAL_REPLICATE_COUNT),
}).passthrough()
const replayFeatureRowSchema = z.object({
  values: z.array(z.number()),
  missingFlags: z.array(z.boolean()),
  provenance: z.object({
    featureContractSha256: sha256Schema,
    forecastOriginManifestId: z.string().uuid(),
    themeId: z.string().uuid(),
    cutoffAt: z.iso.datetime(),
  }).passthrough(),
})

interface ExpectedFeatureProvenance {
  readonly featureContractSha256: string
  readonly forecastOriginManifestId: string
  readonly themeId: string
  readonly cutoffAt: string
}

export class ScientificScoringCriticalIncidentError extends Error {
  readonly name = 'ScientificScoringCriticalIncidentError'
  readonly kind = 'critical_incident'

  constructor(
    readonly code: string,
    readonly predictionId: string | null,
    message = code,
  ) {
    super(message)
  }
}

export interface ScientificIntervalReplayEvidence {
  readonly receipt: ScientificIntervalEvidence
  readonly fullFitArtifact: M1ModelArtifactV2
  readonly replicateBodies: readonly ReplicateBody[]
}

export class ScientificIntervalContractVerifiedPrediction {
  private constructor(
    readonly row: ScientificPredictionRow,
    readonly role: ScientificPredictionRole,
    readonly intervalEligibleCount: number,
    readonly intervalCompleteCount: number,
  ) {}

  static verify(
    row: ScientificPredictionRow,
    role: ScientificPredictionRole,
    evidence: ScientificIntervalReplayEvidence,
    expectedFeature: ExpectedFeatureProvenance,
  ): ScientificIntervalContractVerifiedPrediction {
    let featureRow: z.infer<typeof replayFeatureRowSchema>
    try {
      featureRow = replayFeatureRowSchema.parse(row.features)
    } catch {
      throw new ScientificScoringCriticalIncidentError('interval_replay_prediction_evidence_invalid', row.id)
    }
    const provenance = featureRow.provenance
    if (
      provenance.featureContractSha256 !== expectedFeature.featureContractSha256
      || provenance.forecastOriginManifestId !== expectedFeature.forecastOriginManifestId
      || provenance.themeId !== expectedFeature.themeId
      || provenance.cutoffAt !== expectedFeature.cutoffAt
    ) {
      throw new ScientificScoringCriticalIncidentError('feature_snapshot_provenance_mismatch', row.id)
    }
    const { p_rise: probability, ci_lower: lower, ci_upper: upper } = row
    if (row.abstain) {
      if (probability !== null || lower !== null || upper !== null) {
        throw new ScientificScoringCriticalIncidentError('abstain_interval_contract_violation', row.id)
      }
      return new ScientificIntervalContractVerifiedPrediction(row, role, 0, 0)
    }
    if (
      probability === null || lower === null || upper === null
      || !Number.isFinite(probability) || !Number.isFinite(lower) || !Number.isFinite(upper)
      || lower < 0 || lower > probability || probability > upper || upper > 1
    ) {
      throw new ScientificScoringCriticalIncidentError('prediction_interval_invalid', row.id)
    }
    if (role === 'comparator') {
      if (lower !== probability || upper !== probability) {
        throw new ScientificScoringCriticalIncidentError('comparator_interval_substitute_rejected', row.id)
      }
      return new ScientificIntervalContractVerifiedPrediction(row, role, 1, 1)
    }
    try {
      const replayedPoint = predictM1Probability(evidence.fullFitArtifact, featureRow)
      if (replayedPoint === null || replayedPoint !== probability) {
        throw new ScientificScoringCriticalIncidentError('candidate_point_replay_mismatch', row.id)
      }
      assertReplayedEnvelope({
        fullFitArtifact: evidence.fullFitArtifact,
        replicateBodies: evidence.replicateBodies,
        row: featureRow,
        pointProbability: probability,
        storedLower: lower,
        storedUpper: upper,
      })
    } catch (error) {
      if (error instanceof ScientificScoringCriticalIncidentError) throw error
      const code = error instanceof IntervalReplayError
        ? error.code
        : 'interval_replay_prediction_evidence_invalid'
      throw new ScientificScoringCriticalIncidentError(code, row.id)
    }
    return new ScientificIntervalContractVerifiedPrediction(row, role, 1, 1)
  }
}

export function parseScientificIntervalReplayEvidence(
  cycle: ScientificCycleRow,
  artifact: ScientificEvidenceArtifactRow,
): ScientificIntervalReplayEvidence {
  try {
    if (canonicalJsonV1Sha256(artifact.payload) !== artifact.content_sha256) {
      throw new ScientificScoringCriticalIncidentError('model_manifest_content_sha256_mismatch', null)
    }
    if (artifact.payload.interval_replicate_count !== INTERVAL_REPLICATE_COUNT) {
      throw new ScientificScoringCriticalIncidentError('interval_replay_requires_exact_500', null)
    }
    const payload = intervalManifestSchema.parse(artifact.payload)
    if (
      payload.candidate_model_version !== cycle.candidate_model_version
      || payload.candidate_model_sha256 !== cycle.candidate_model_sha256
      || payload.comparator_version !== cycle.comparator_version
      || payload.comparator_artifact_sha256 !== cycle.comparator_artifact_sha256
    ) {
      throw new ScientificScoringCriticalIncidentError(
        'interval_model_manifest_identity_mismatch',
        null,
        'interval model manifest identity mismatch',
      )
    }
    if (canonicalJsonV1Sha256(payload.interval_ensemble_artifact) !== payload.interval_ensemble_sha256) {
      throw new ScientificScoringCriticalIncidentError('interval_ensemble_sha256_mismatch', null)
    }
    if (canonicalJsonV1Sha256(payload.candidate_model_artifact) !== payload.candidate_model_sha256) {
      throw new ScientificScoringCriticalIncidentError('candidate_model_artifact_sha256_mismatch', null)
    }
    const fullFitArtifact = parseM1ModelArtifact(payload.candidate_model_artifact)
    const intervalEnsemble = intervalEnsembleArtifactSchema.parse(payload.interval_ensemble_artifact)
    return {
      receipt: {
        ensembleVersion: payload.interval_ensemble_version,
        envelopeVersion: payload.interval_envelope_version,
        replicateCount: payload.interval_replicate_count,
        ensembleSha256: payload.interval_ensemble_sha256,
      },
      fullFitArtifact,
      replicateBodies: intervalEnsemble.replicate_bodies,
    }
  } catch (error) {
    if (error instanceof ScientificScoringCriticalIncidentError) throw error
    throw new ScientificScoringCriticalIncidentError('interval_replay_manifest_invalid', null)
  }
}
