/**
 * TCAR-001: Canonical enterprise contracts for analog retrieval
 *
 * Defines artifact contracts, boundary source enum, and policy version vocabulary
 * as specified in the enterprise PRD (tli-theme-cycle-analog-retrieval-enterprise-prd.md).
 */

import type { Stage } from '../types/db'

// --- Boundary Source ---

export const BOUNDARY_SOURCES = ['observed', 'inferred-v1', 'imported'] as const
export type BoundarySource = (typeof BOUNDARY_SOURCES)[number]

export const isBoundarySource = (value: unknown): value is BoundarySource =>
  typeof value === 'string' && BOUNDARY_SOURCES.includes(value as BoundarySource)

// --- Artifact Versions ---

export const ARTIFACT_VERSIONS = {
  episode_registry: 'episode_registry_v1',
  query_snapshot: 'query_snapshot_v1',
  label_table: 'label_table_v1',
  analog_candidates: 'analog_candidates_v1',
  analog_evidence: 'analog_evidence_v1',
  forecast_control: 'forecast_control_v1',
  bridge_run_audits: 'bridge_run_audits_v1',
} as const

export type ArtifactVersionKey = keyof typeof ARTIFACT_VERSIONS
export type ArtifactVersionValue = (typeof ARTIFACT_VERSIONS)[ArtifactVersionKey]

const VALID_ARTIFACT_VERSIONS = new Set(Object.values(ARTIFACT_VERSIONS))

export const isValidArtifactVersion = (value: unknown): value is ArtifactVersionValue =>
  typeof value === 'string' && VALID_ARTIFACT_VERSIONS.has(value as ArtifactVersionValue)

// --- Policy Versions ---

export const POLICY_VERSION_FIELDS = [
  'theme_definition_version',
  'episode_policy_version',
  'label_policy_version',
  'feature_family_version',
  'retrieval_spec_version',
  'calibration_version',
  'forecast_version',
] as const

export type PolicyVersionField = (typeof POLICY_VERSION_FIELDS)[number]

export interface PolicyVersionSet {
  theme_definition_version: string
  episode_policy_version: string
  label_policy_version: string
  feature_family_version: string
  retrieval_spec_version: string
  calibration_version: string
  forecast_version: string
}

export const createDefaultPolicyVersions = (): PolicyVersionSet => ({
  theme_definition_version: '1.0',
  episode_policy_version: '1.0',
  label_policy_version: '1.0',
  feature_family_version: '1.0',
  retrieval_spec_version: '1.0',
  calibration_version: '1.0',
  forecast_version: '1.0',
})

export const POLICY_VERSION_PATTERN = /^\d+\.\d+$/

export const isValidPolicyVersion = (v: string): boolean =>
  POLICY_VERSION_PATTERN.test(v)

export const isCompletePolicyVersionSet = (value: PolicyVersionSet): boolean =>
  POLICY_VERSION_FIELDS.every(
    field => typeof value[field] === 'string' && value[field].length > 0,
  )

// --- Retrieval Surface ---

export const RETRIEVAL_SURFACES = [
  'price_volume_knn',
  'dtw_baseline',
  'regime_filtered_nn',
  'future_aligned_reranker',
] as const

export type RetrievalSurface = (typeof RETRIEVAL_SURFACES)[number]

// --- Reconstruction Status ---

export type ReconstructionStatus = 'success' | 'partial' | 'failed'

// --- Evidence Quality ---

export type EvidenceQuality = 'high' | 'medium' | 'low'

// --- Artifact Contracts ---

export interface EpisodeRegistryV1 {
  id: string
  theme_id: string
  episode_number: number
  boundary_source_start: BoundarySource
  boundary_source_end: BoundarySource | null
  episode_start: string
  episode_end: string | null
  is_active: boolean
  multi_peak: boolean
  primary_peak_date: string | null
  peak_score: number | null
  policy_versions: PolicyVersionSet
  created_at: string
  updated_at: string
}

export interface QuerySnapshotV1 {
  id: string
  episode_id: string
  theme_id: string
  snapshot_date: string
  source_data_cutoff: string
  features: Record<string, number>
  lifecycle_score: number
  stage: Stage
  days_since_episode_start: number
  policy_versions: PolicyVersionSet
  reconstruction_status: ReconstructionStatus
  reconstruction_reason: string | null
  created_at: string
}

export interface LabelTableV1 {
  id: string
  episode_id: string
  theme_id: string
  boundary_source: BoundarySource
  source_data_cutoff: string
  is_completed: boolean
  peak_date: string | null
  peak_score: number | null
  days_to_peak: number | null
  post_peak_drawdown_10d: number | null
  post_peak_drawdown_20d: number | null
  stage_at_peak: Stage | null
  is_promotion_eligible: boolean
  promotion_ineligible_reason: string | null
  policy_versions: PolicyVersionSet
  created_at: string
  updated_at: string
}

export interface AnalogCandidatesV1 {
  id: string
  query_snapshot_id: string
  query_theme_id: string
  candidate_episode_id: string
  candidate_theme_id: string
  rank: number
  retrieval_surface: RetrievalSurface
  similarity_score: number
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  dtw_distance: number | null
  regime_match: boolean
  is_future_aligned: boolean
  reranker_score: number | null
  reranker_version: string | null
  policy_versions: PolicyVersionSet
  created_at: string
}

export interface AnalogEvidenceV1 {
  id: string
  query_snapshot_id: string
  query_theme_id: string
  candidate_id: string
  candidate_episode_id: string
  analog_future_path_summary: {
    peak_day: number
    total_days: number
    final_stage: Stage
    post_peak_drawdown: number | null
  }
  retrieval_reason: string
  mismatch_summary: string | null
  evidence_quality: EvidenceQuality
  evidence_quality_score: number
  analog_support_count: number
  candidate_concentration_gini: number
  top1_analog_weight: number
  policy_versions: PolicyVersionSet
  created_at: string
}
