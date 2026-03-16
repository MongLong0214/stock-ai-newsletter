/**
 * TCAR-002: DB row types for bridge schema tables.
 *
 * These are snake_case Supabase row types that correspond to the
 * camelCase TS artifact interfaces in analog/types.ts and forecast/types.ts.
 */

import type { BoundarySource } from '../analog/types'
import type { BridgeRowName, GatePassResult } from '../forecast/types'

export interface EpisodeRegistryRow {
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
  policy_versions: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface QuerySnapshotRow {
  id: string
  episode_id: string
  theme_id: string
  snapshot_date: string
  source_data_cutoff: string
  features: Record<string, unknown>
  lifecycle_score: number
  stage: string
  days_since_episode_start: number
  policy_versions: Record<string, unknown>
  reconstruction_status: 'success' | 'partial' | 'failed'
  reconstruction_reason: string | null
  created_at: string
}

export interface LabelTableRow {
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
  stage_at_peak: string | null
  is_promotion_eligible: boolean
  promotion_ineligible_reason: string | null
  policy_versions: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AnalogCandidatesRow {
  id: string
  query_snapshot_id: string
  query_theme_id: string
  candidate_episode_id: string
  candidate_theme_id: string
  rank: number
  retrieval_surface: string
  similarity_score: number
  feature_sim: number | null
  curve_sim: number | null
  keyword_sim: number | null
  dtw_distance: number | null
  regime_match: boolean
  is_future_aligned: boolean
  reranker_score: number | null
  reranker_version: string | null
  policy_versions: Record<string, unknown>
  created_at: string
}

export interface AnalogEvidenceRow {
  id: string
  query_snapshot_id: string
  query_theme_id: string
  candidate_id: string
  candidate_episode_id: string
  analog_future_path_summary: Record<string, unknown>
  retrieval_reason: string
  mismatch_summary: string | null
  evidence_quality: 'high' | 'medium' | 'low'
  evidence_quality_score: number
  analog_support_count: number
  candidate_concentration_gini: number
  top1_analog_weight: number
  policy_versions: Record<string, unknown>
  created_at: string
}

export interface ForecastControlRow {
  id: string
  artifact_version: string
  production_version: string
  serving_status: 'shadow' | 'canary' | 'production' | 'rolled_back' | 'disabled'
  cutover_ready: boolean
  rollback_target_version: string | null
  rollback_drill_count: number
  rollback_drill_last_success: string | null
  fail_closed_verified: boolean
  ship_verdict_artifact_id: string | null
  policy_versions: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BridgeRunAuditRow {
  id: string
  artifact_version: string
  run_date: string
  bridge_row: BridgeRowName
  parity: Record<string, unknown>
  verdict: GatePassResult
  cutover_eligible: boolean
  rollback_triggered: boolean
  details: Record<string, unknown> | null
  created_at: string
}
