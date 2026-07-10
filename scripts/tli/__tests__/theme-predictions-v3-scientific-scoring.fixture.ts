import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import { CONFIRMATORY_FEATURE_NAMES } from '@/lib/tli/features/confirmatory-feature-types'
import type { ScientificPredictionScoringInput } from '../comparison/theme-predictions-v3-scientific-scoring'

export type ScientificScoringFixture = {
  -readonly [Key in keyof ScientificPredictionScoringInput]:
    ScientificPredictionScoringInput[Key] extends readonly (infer Row)[] ? Row[] : ScientificPredictionScoringInput[Key]
}

export const CYCLE_ID = '10000000-0000-4000-8000-000000000001'
export const OTHER_CYCLE_ID = '10000000-0000-4000-8000-000000000002'
export const ORIGIN_ID = '20000000-0000-4000-8000-000000000001'
export const OTHER_ORIGIN_ID = '20000000-0000-4000-8000-000000000002'
export const STUDY_ID = '30000000-0000-4000-8000-000000000001'
export const STUDY_ORIGIN_ID = '40000000-0000-4000-8000-000000000001'
export const FORECAST_ID = '50000000-0000-4000-8000-000000000001'
export const OTHER_FORECAST_ID = '50000000-0000-4000-8000-000000000002'
export const THEME_ID = '60000000-0000-4000-8000-000000000001'
export const LABEL_ID = '70000000-0000-4000-8000-000000000001'
export const CANDIDATE_ID = '80000000-0000-4000-8000-000000000001'
export const COMPARATOR_ID = '80000000-0000-4000-8000-000000000002'

export const CANDIDATE_SHA = 'a'.repeat(64)
export const COMPARATOR_SHA = 'b'.repeat(64)
export const FEATURE_CONTRACT_SHA = 'c'.repeat(64)
export const FEATURE_SNAPSHOT = {
  featureNames: CONFIRMATORY_FEATURE_NAMES,
  values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0, 0],
  missingFlags: Array.from({ length: CONFIRMATORY_FEATURE_NAMES.length }, () => false),
  abstain: false,
  abstainReasons: [],
  provenance: {
    featureContractSha256: FEATURE_CONTRACT_SHA,
    forecastOriginManifestId: FORECAST_ID,
    themeId: THEME_ID,
    cutoffAt: '2026-07-06T09:00:00.000Z',
  },
} as const
export const FEATURE_SNAPSHOT_SHA = canonicalJsonV1Sha256(FEATURE_SNAPSHOT)
export const INTERVAL_SHA = 'e'.repeat(64)
const ORIGIN_ARTIFACT_SHA = 'f'.repeat(64)
const MODEL_MANIFEST_SHA = '1'.repeat(64)

const forecast = {
  id: FORECAST_ID,
  origin_date: '2026-07-06',
  forecast_cutoff: '2026-07-06T09:00:00.000Z',
  expected_theme_ids: [THEME_ID],
  expected_theme_count: 1,
}

const predictionBase = {
  experiment_cycle_id: CYCLE_ID,
  experiment_origin_manifest_id: ORIGIN_ID,
  theme_id: THEME_ID,
  prediction_date: forecast.origin_date,
  horizon_days: 5,
  serving_role: 'shadow',
  labeler_version: 'gta-v2',
  features: FEATURE_SNAPSHOT,
  feature_contract_hash: FEATURE_CONTRACT_SHA,
  feature_snapshot_hash: FEATURE_SNAPSHOT_SHA,
  forecast_cutoff: forecast.forecast_cutoff,
  forecast_origin_week: forecast.origin_date,
  abstain: false,
  score_status: 'pending',
  created_at: '2026-07-06T09:01:00.000Z',
} as const

export function makeScientificScoringFixture(): ScientificScoringFixture {
  return {
    requestedCycleId: CYCLE_ID,
    requestedOriginId: ORIGIN_ID,
    scoredAt: '2026-07-14T00:00:00.000Z',
    cycles: [
      {
        id: CYCLE_ID,
        status: 'running',
        study_contract_id: STUDY_ID,
        candidate_model_version: 'candidate-v2',
        candidate_model_sha256: CANDIDATE_SHA,
        comparator_version: 'comparator-v1',
        comparator_artifact_sha256: COMPARATOR_SHA,
        feature_contract_sha256: FEATURE_CONTRACT_SHA,
        labeler_version: 'gta-v2',
      },
      {
        id: OTHER_CYCLE_ID,
        status: 'running',
        study_contract_id: STUDY_ID,
        candidate_model_version: 'candidate-v1',
        candidate_model_sha256: '2'.repeat(64),
        comparator_version: 'comparator-v1',
        comparator_artifact_sha256: COMPARATOR_SHA,
        feature_contract_sha256: FEATURE_CONTRACT_SHA,
        labeler_version: 'gta-v2',
      },
    ],
    origins: [{
      id: ORIGIN_ID,
      cycle_id: CYCLE_ID,
      study_origin_manifest_id: STUDY_ORIGIN_ID,
      forecast_origin_manifest_id: FORECAST_ID,
      candidate_model_sha256: CANDIDATE_SHA,
      comparator_artifact_sha256: COMPARATOR_SHA,
    }],
    studyOrigins: [{
      id: STUDY_ORIGIN_ID,
      study_contract_id: STUDY_ID,
      forecast_origin_manifest_id: FORECAST_ID,
    }],
    forecasts: [forecast],
    evidenceArtifacts: [
      {
        id: '90000000-0000-4000-8000-000000000001',
        cycle_id: CYCLE_ID,
        experiment_origin_manifest_id: ORIGIN_ID,
        artifact_type: 'origin_manifest',
        artifact_key: forecast.origin_date,
        content_sha256: ORIGIN_ARTIFACT_SHA,
        payload: {},
        created_at: '2026-07-06T09:00:30.000Z',
      },
      {
        id: '90000000-0000-4000-8000-000000000002',
        cycle_id: CYCLE_ID,
        experiment_origin_manifest_id: null,
        artifact_type: 'model_manifest',
        artifact_key: 'singleton',
        content_sha256: MODEL_MANIFEST_SHA,
        payload: {
          candidate_model_version: 'candidate-v2',
          candidate_model_sha256: CANDIDATE_SHA,
          comparator_version: 'comparator-v1',
          comparator_artifact_sha256: COMPARATOR_SHA,
          interval_ensemble_version: 'interval-ensemble-v2',
          interval_envelope_version: 'block_bootstrap_envelope_v1',
          interval_replicate_count: 500,
          interval_ensemble_sha256: INTERVAL_SHA,
        },
        created_at: '2026-07-01T00:00:00.000Z',
      },
    ],
    evidenceAttestations: [
      {
        artifact_id: '90000000-0000-4000-8000-000000000001',
        content_sha256: ORIGIN_ARTIFACT_SHA,
        verified_at: '2026-07-06T09:00:45.000Z',
      },
      {
        artifact_id: '90000000-0000-4000-8000-000000000002',
        content_sha256: MODEL_MANIFEST_SHA,
        verified_at: '2026-07-01T00:01:00.000Z',
      },
    ],
    predictions: [
      {
        ...predictionBase,
        id: CANDIDATE_ID,
        scientific_prediction_role: 'candidate',
        model_version: 'candidate-v2',
        model_artifact_sha256: CANDIDATE_SHA,
        p_rise: 0.72,
        ci_lower: 0.61,
        ci_upper: 0.81,
      },
      {
        ...predictionBase,
        id: COMPARATOR_ID,
        scientific_prediction_role: 'comparator',
        model_version: 'comparator-v1',
        model_artifact_sha256: COMPARATOR_SHA,
        p_rise: 0.65,
        ci_lower: 0.55,
        ci_upper: 0.75,
      },
      {
        ...predictionBase,
        id: '80000000-0000-4000-8000-000000000003',
        experiment_cycle_id: OTHER_CYCLE_ID,
        experiment_origin_manifest_id: OTHER_ORIGIN_ID,
        scientific_prediction_role: 'candidate',
        model_version: 'candidate-v1',
        model_artifact_sha256: '2'.repeat(64),
        p_rise: 0.01,
        ci_lower: 0,
        ci_upper: 0.1,
      },
      {
        ...predictionBase,
        id: '80000000-0000-4000-8000-000000000004',
        experiment_cycle_id: OTHER_CYCLE_ID,
        experiment_origin_manifest_id: OTHER_ORIGIN_ID,
        scientific_prediction_role: 'comparator',
        model_version: 'comparator-v1',
        model_artifact_sha256: COMPARATOR_SHA,
        p_rise: 0.99,
        ci_lower: 0.9,
        ci_upper: 1,
      },
    ],
    labels: [
      {
        id: '70000000-0000-4000-8000-000000000002',
        theme_id: THEME_ID,
        base_date: forecast.origin_date,
        horizon_days: 5,
        labeler_version: 'gta-v1',
        label_type: 'gt_a',
        label_status: 'final',
        scientific_use_status: 'confirmatory_eligible',
        g_log_ratio: -0.5,
        y_binary: false,
        exclude_reason: null,
        forecast_origin_manifest_id: FORECAST_ID,
        finalized_at: '2026-07-13T09:00:00.000Z',
      },
      {
        id: LABEL_ID,
        theme_id: THEME_ID,
        base_date: forecast.origin_date,
        horizon_days: 5,
        labeler_version: 'gta-v2',
        label_type: 'gt_a',
        label_status: 'final',
        scientific_use_status: 'confirmatory_eligible',
        g_log_ratio: 0.25,
        y_binary: true,
        exclude_reason: null,
        forecast_origin_manifest_id: FORECAST_ID,
        finalized_at: '2026-07-13T09:00:00.000Z',
      },
      {
        id: '70000000-0000-4000-8000-000000000003',
        theme_id: THEME_ID,
        base_date: forecast.origin_date,
        horizon_days: 5,
        labeler_version: 'gta-v2',
        label_type: 'gt_a',
        label_status: 'final',
        scientific_use_status: 'confirmatory_eligible',
        g_log_ratio: -0.3,
        y_binary: false,
        exclude_reason: null,
        forecast_origin_manifest_id: OTHER_FORECAST_ID,
        finalized_at: '2026-07-13T09:00:00.000Z',
      },
    ],
  }
}
