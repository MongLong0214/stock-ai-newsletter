import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  ThemeComparisonRunV2,
  ThemeComparisonCandidateV2,
  ThemeComparisonEvalV2,
  PredictionSnapshotV2,
  ThemeStateHistoryV2,
  ComparisonBackfillManifestV2,
} from '../../../lib/tli/types/db'

const migrationPath = join(process.cwd(), 'supabase/migrations/016_comparison_v4_foundation.sql')

describe('comparison v4 schema migration', () => {
  it('creates the required v2 internal tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS theme_comparison_runs_v2')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS theme_comparison_candidates_v2')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS theme_comparison_eval_v2')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS prediction_snapshots_v2')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS theme_state_history_v2')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS comparison_backfill_manifest_v2')
  })

  it('creates a comparison v4 control table in the follow-up migration', () => {
    const controlSql = readFileSync(join(process.cwd(), 'supabase/migrations/017_comparison_v4_control.sql'), 'utf8')
    expect(controlSql).toContain('CREATE TABLE IF NOT EXISTS comparison_v4_control')
    expect(controlSql).toContain('production_version')
    expect(controlSql).toContain('serving_enabled')
    expect(controlSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_v4_control_single_enabled')
  })

  it('adds lineage-safe uniqueness and key columns', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('UNIQUE(run_date, current_theme_id, algorithm_version, run_type, candidate_pool)')
    expect(sql).toContain('comparison_run_id UUID')
    expect(sql).toContain('UNIQUE(theme_id, snapshot_date, algorithm_version, run_type, candidate_pool, evaluation_horizon_days)')
    expect(sql).toContain('prediction_intervals JSONB')
  })

  it('adds publish and retry metadata to runs', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('status TEXT')
    expect(sql).toContain('publish_ready BOOLEAN')
    expect(sql).toContain('expected_candidate_count INTEGER')
    expect(sql).toContain('materialized_candidate_count INTEGER')
    expect(sql).toContain('attempt_no INTEGER')
  })

  it('contains RLS and policy definitions for raw internal tables', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE theme_comparison_runs_v2 ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('TO service_role')
  })

  it('constrains enum-like text fields with CHECK clauses', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("CHECK (run_type IN ('prod', 'shadow', 'backtest'))")
    expect(sql).toContain("CHECK (candidate_pool IN ('archetype', 'peer', 'mixed_legacy'))")
    expect(sql).toContain("CHECK (status IN ('pending', 'materializing', 'complete', 'published', 'failed', 'rolled_back'))")
  })
})

describe('comparison v4 db types', () => {
  it('exports v2 internal db types', () => {
    const run: ThemeComparisonRunV2 = {
      id: 'run-1',
      run_date: '2026-03-11',
      current_theme_id: 'theme-1',
      algorithm_version: 'v4',
      run_type: 'shadow',
      candidate_pool: 'archetype',
      threshold_policy_version: 'v1',
      source_data_cutoff_date: '2026-03-11',
      comparison_spec_version: 'v4',
      status: 'pending',
      publish_ready: false,
      expected_candidate_count: 0,
      materialized_candidate_count: 0,
      expected_snapshot_count: 0,
      materialized_snapshot_count: 0,
      attempt_no: 1,
      checkpoint_cursor: null,
      last_error: null,
      started_at: null,
      completed_at: null,
      published_at: null,
      created_at: '2026-03-11T00:00:00Z',
    }

    const candidate: ThemeComparisonCandidateV2 = {
      run_id: 'run-1',
      candidate_theme_id: 'theme-2',
      rank: 1,
      similarity_score: 0.5,
      feature_sim: 0.4,
      curve_sim: 0.6,
      keyword_sim: 0.1,
      current_day: 12,
      past_peak_day: 20,
      past_total_days: 40,
      estimated_days_to_peak: 8,
      message: 'msg',
      past_peak_score: 80,
      past_final_stage: 'Decline',
      past_decline_days: 12,
      is_selected_top3: true,
    }

    const evaluation: ThemeComparisonEvalV2 = {
      run_id: 'run-1',
      candidate_theme_id: 'theme-2',
      evaluation_horizon_days: 14,
      trajectory_corr_h14: 0.4,
      position_stage_match_h14: true,
      binary_relevant: true,
      graded_gain: 2,
      censored_reason: null,
      evaluated_at: '2026-03-25T00:00:00Z',
    }

    const snapshot: PredictionSnapshotV2 = {
      id: 'snap-1',
      theme_id: 'theme-1',
      snapshot_date: '2026-03-11',
      comparison_run_id: 'run-1',
      comparison_count: 3,
      avg_similarity: 0.6,
      phase: 'rising',
      confidence: 'high',
      risk_level: 'low',
      momentum: 'accelerating',
      avg_peak_day: 20,
      avg_total_days: 40,
      avg_days_to_peak: 8,
      current_progress: 30,
      days_since_spike: 12,
      best_scenario: {},
      median_scenario: {},
      worst_scenario: {},
      status: 'pending',
      created_at: '2026-03-11T00:00:00Z',
      algorithm_version: 'v4',
      run_type: 'shadow',
      candidate_pool: 'archetype',
      evaluation_horizon_days: 14,
      comparison_spec_version: 'v4',
      evaluated_at: null,
      actual_score: null,
      actual_stage: null,
      phase_correct: null,
      peak_timing_error_days: null,
    }

    const stateHistory: ThemeStateHistoryV2 = {
      theme_id: 'theme-1',
      effective_from: '2026-03-01',
      effective_to: null,
      is_active: true,
      closed_at: null,
      first_spike_date: '2026-03-02',
      state_version: 'v1',
    }

    const manifest: ComparisonBackfillManifestV2 = {
      manifest_id: 'manifest-1',
      source_table: 'theme_comparisons',
      source_row_count: 10,
      target_row_count: 10,
      row_count_parity_ok: true,
      sample_contract_parity_ok: true,
      executed_at: '2026-03-11T00:00:00Z',
      notes: null,
    }

    expect(run.run_type).toBe('shadow')
    expect(candidate.is_selected_top3).toBe(true)
    expect(evaluation.graded_gain).toBe(2)
    expect(snapshot.candidate_pool).toBe('archetype')
    expect(stateHistory.state_version).toBe('v1')
    expect(manifest.row_count_parity_ok).toBe(true)
  })
})
