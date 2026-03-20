import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as dbTypes from '@/lib/tli/types/db'
import type {
  ThemeComparisonRunV2,
  ThemeComparisonCandidateV2,
  ThemeComparisonEvalV2,
  PredictionSnapshotV2,
  ThemeStateHistoryV2,
  ComparisonV4Control,
  DriftReportArtifact,
} from '@/lib/tli/types/db'

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

  it('adds level4 promotion metadata and drift artifact persistence in the next migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/022_level4_promotion_and_drift.sql'), 'utf8')

    expect(sql).toContain('ALTER TABLE comparison_v4_control')
    expect(sql).toContain('calibration_version')
    expect(sql).toContain('weight_version')
    expect(sql).toContain('drift_version')
    expect(sql).toContain('promotion_gate_status')
    expect(sql).toContain('previous_stable_version')
    expect(sql).toContain('auto_hold_enabled')
    expect(sql).toContain('hold_state')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS drift_report_artifact')
    expect(sql).toContain('support_bucket_precision')
  })

  it('adds base_rate to drift_report_artifact in the follow-up migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/024_level4_drift_base_rate.sql'), 'utf8')
    expect(sql).toContain('ALTER TABLE drift_report_artifact')
    expect(sql).toContain('base_rate')
  })

  it('adds an atomic promotion function for comparison v4 release cutover', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/025_comparison_v4_atomic_promotion.sql'), 'utf8')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION promote_comparison_v4_release')
    expect(sql).toContain('theme_comparison_runs_v2')
    expect(sql).toContain('comparison_v4_control')
  })

  it('adds promotion-runtime drift evidence columns in the next migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/026_level4_drift_gate_columns.sql'), 'utf8')
    expect(sql).toContain('ALTER TABLE drift_report_artifact')
    expect(sql).toContain('baseline_candidate_concentration_gini')
    expect(sql).toContain('baseline_censoring_ratio')
    expect(sql).toContain('low_confidence_serving_rate')
    expect(sql).toContain('hold_report_date')
  })

  it('adds a forward migration that retires legacy comparison tables once v4 is live', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/028_retire_legacy_tli_comparison_schema.sql'), 'utf8')
    expect(sql).toContain('DROP TABLE IF EXISTS prediction_snapshots')
    expect(sql).toContain('DROP TABLE IF EXISTS theme_comparisons')
    expect(sql).toContain('DROP TABLE IF EXISTS comparison_calibration')
  })

  it('uses UUID foreign keys for phase0 bridge tables that reference themes(id)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/027_tcar002_phase0_bridge_schema.sql'), 'utf8')
    expect(sql).toContain('theme_id UUID NOT NULL REFERENCES themes(id)')
    expect(sql).toContain('query_theme_id UUID NOT NULL REFERENCES themes(id)')
    expect(sql).toContain('candidate_theme_id UUID NOT NULL REFERENCES themes(id)')
  })

  it('uses valid CREATE POLICY ordering in phase0 bridge schema', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/027_tcar002_phase0_bridge_schema.sql'), 'utf8')
    expect(sql).toMatch(/FOR ALL TO service_role\s+USING \(true\)\s+WITH CHECK \(true\);/)
  })

  it('adds certification weight artifact persistence in the following migration', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/023_level4_weight_artifacts.sql'), 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS weight_artifact')
    expect(sql).toContain('weight_version')
    expect(sql).toContain('curve_bucket_policy')
    expect(sql).toContain('validation_metric_summary')
    expect(sql).toContain('ci_method')
    expect(sql).toContain('bootstrap_iterations')
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
      theme_definition_version: 'td-v2.0',
      lifecycle_score_version: 'ls-v2.0',
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

    const control: ComparisonV4Control = {
      id: 'control-1',
      production_version: 'algo-v4-prod',
      serving_enabled: true,
      promoted_by: 'codex',
      promoted_at: '2026-03-11T00:00:00Z',
      created_at: '2026-03-11T00:00:00Z',
      source_surface: 'v2_certification',
      calibration_version: 'cal-2026-03',
      weight_version: null,
      drift_version: 'drift-2026-03',
      promotion_gate_status: 'passed',
      promotion_gate_summary: 'all release gates passed',
      promotion_gate_failures: [],
      previous_stable_version: 'algo-v4-prev',
      rollback_reason: null,
      rolled_back_at: null,
      auto_hold_enabled: true,
      hold_state: 'inactive',
      hold_reason: null,
      hold_report_date: '2026-03-31',
      updated_at: '2026-03-11T00:00:00Z',
    }

    const driftArtifact: DriftReportArtifact = {
      drift_version: 'drift-2026-03',
      report_date: '2026-03-31',
      source_surface: 'v2_certification',
      relevance_base_rate: 0.05,
      calibration_curve_error: 0.02,
      brier: 0.04,
      ece: 0.03,
      candidate_concentration_gini: 0.21,
      censoring_ratio: 0.11,
      first_spike_inference_rate: 0.18,
      support_bucket_precision: { high: 0.8, medium: 0.55, low: 0.14 },
      baseline_window_months: 3,
      baseline_row_count: 3200,
      auto_hold_enabled: true,
      drift_status: 'stable',
      triggered_rules: [],
      created_at: '2026-03-31T00:00:00Z',
    }

    expect(run.run_type).toBe('shadow')
    expect(candidate.is_selected_top3).toBe(true)
    expect(evaluation.graded_gain).toBe(2)
    expect(snapshot.candidate_pool).toBe('archetype')
    expect(stateHistory.state_version).toBe('v1')
    expect(control.calibration_version).toBe('cal-2026-03')
    expect(driftArtifact.drift_status).toBe('stable')
  })

  it('does not export retired legacy comparison db interfaces', () => {
    expect('ThemeComparison' in dbTypes).toBe(false)
    expect('ComparisonCalibration' in dbTypes).toBe(false)
    expect('ComparisonBackfillManifestV2' in dbTypes).toBe(false)
  })
})
