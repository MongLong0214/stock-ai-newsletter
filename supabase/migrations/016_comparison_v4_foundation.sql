-- =====================================================
-- Migration: 016_comparison_v4_foundation.sql
-- Description: Comparison v4 internal shadow tables, policies, and retention fields
-- =====================================================

CREATE TABLE IF NOT EXISTS theme_comparison_runs_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  current_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  algorithm_version TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('prod', 'shadow', 'backtest')),
  candidate_pool TEXT NOT NULL CHECK (candidate_pool IN ('archetype', 'peer', 'mixed_legacy')),
  threshold_policy_version TEXT NOT NULL,
  source_data_cutoff_date DATE NOT NULL,
  comparison_spec_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'materializing', 'complete', 'published', 'failed', 'rolled_back')),
  publish_ready BOOLEAN NOT NULL DEFAULT false,
  expected_candidate_count INTEGER NOT NULL DEFAULT 0,
  materialized_candidate_count INTEGER NOT NULL DEFAULT 0,
  expected_snapshot_count INTEGER NOT NULL DEFAULT 0,
  materialized_snapshot_count INTEGER NOT NULL DEFAULT 0,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  checkpoint_cursor JSONB,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_date, current_theme_id, algorithm_version, run_type, candidate_pool)
);

CREATE INDEX IF NOT EXISTS idx_theme_comparison_runs_v2_current_date
  ON theme_comparison_runs_v2(current_theme_id, run_date DESC, run_type, algorithm_version);
CREATE INDEX IF NOT EXISTS idx_theme_comparison_runs_v2_status_publish
  ON theme_comparison_runs_v2(status, publish_ready, run_type, run_date DESC);

CREATE TABLE IF NOT EXISTS theme_comparison_candidates_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES theme_comparison_runs_v2(id) ON DELETE CASCADE,
  candidate_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  similarity_score REAL NOT NULL,
  feature_sim REAL,
  curve_sim REAL,
  keyword_sim REAL,
  current_day INTEGER NOT NULL,
  past_peak_day INTEGER NOT NULL,
  past_total_days INTEGER NOT NULL,
  estimated_days_to_peak INTEGER NOT NULL,
  message TEXT NOT NULL,
  past_peak_score INTEGER,
  past_final_stage TEXT,
  past_decline_days INTEGER,
  is_selected_top3 BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, candidate_theme_id)
);

CREATE INDEX IF NOT EXISTS idx_theme_comparison_candidates_v2_run_rank
  ON theme_comparison_candidates_v2(run_id, rank);
CREATE INDEX IF NOT EXISTS idx_theme_comparison_candidates_v2_candidate_run
  ON theme_comparison_candidates_v2(candidate_theme_id, run_id);

CREATE TABLE IF NOT EXISTS theme_comparison_eval_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES theme_comparison_runs_v2(id) ON DELETE CASCADE,
  candidate_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  evaluation_horizon_days INTEGER NOT NULL,
  trajectory_corr_h14 REAL,
  position_stage_match_h14 BOOLEAN,
  binary_relevant BOOLEAN NOT NULL DEFAULT false,
  graded_gain INTEGER NOT NULL DEFAULT 0,
  censored_reason TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, candidate_theme_id, evaluation_horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_theme_comparison_eval_v2_run_horizon
  ON theme_comparison_eval_v2(run_id, evaluation_horizon_days);
CREATE INDEX IF NOT EXISTS idx_theme_comparison_eval_v2_relevant_censor
  ON theme_comparison_eval_v2(binary_relevant, censored_reason);

CREATE TABLE IF NOT EXISTS prediction_snapshots_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  comparison_run_id UUID NOT NULL REFERENCES theme_comparison_runs_v2(id) ON DELETE CASCADE,
  comparison_count INTEGER NOT NULL,
  avg_similarity REAL NOT NULL,
  phase TEXT NOT NULL,
  confidence TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  momentum TEXT NOT NULL,
  avg_peak_day INTEGER NOT NULL,
  avg_total_days INTEGER NOT NULL,
  avg_days_to_peak INTEGER NOT NULL,
  current_progress REAL NOT NULL,
  days_since_spike INTEGER NOT NULL,
  best_scenario JSONB,
  median_scenario JSONB,
  worst_scenario JSONB,
  prediction_intervals JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  evaluated_at TIMESTAMPTZ,
  actual_score INTEGER,
  actual_stage TEXT,
  phase_correct BOOLEAN,
  peak_timing_error_days INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  algorithm_version TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('prod', 'shadow', 'backtest')),
  candidate_pool TEXT NOT NULL CHECK (candidate_pool IN ('archetype', 'peer', 'mixed_legacy')),
  evaluation_horizon_days INTEGER NOT NULL,
  comparison_spec_version TEXT NOT NULL,
  UNIQUE(theme_id, snapshot_date, algorithm_version, run_type, candidate_pool, evaluation_horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_prediction_snapshots_v2_theme_date
  ON prediction_snapshots_v2(theme_id, snapshot_date DESC, run_type, algorithm_version, candidate_pool);

CREATE TABLE IF NOT EXISTS theme_state_history_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL,
  closed_at DATE,
  first_spike_date DATE,
  state_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_theme_state_history_v2_theme_effective
  ON theme_state_history_v2(theme_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS comparison_backfill_manifest_v2 (
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  target_row_count INTEGER NOT NULL DEFAULT 0,
  row_count_parity_ok BOOLEAN NOT NULL DEFAULT false,
  sample_contract_parity_ok BOOLEAN NOT NULL DEFAULT false,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

ALTER TABLE theme_comparison_runs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_comparison_candidates_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_comparison_eval_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_snapshots_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_state_history_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_backfill_manifest_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to theme_comparison_runs_v2"
  ON theme_comparison_runs_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to theme_comparison_candidates_v2"
  ON theme_comparison_candidates_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to theme_comparison_eval_v2"
  ON theme_comparison_eval_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to prediction_snapshots_v2"
  ON prediction_snapshots_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to theme_state_history_v2"
  ON theme_state_history_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role full access to comparison_backfill_manifest_v2"
  ON comparison_backfill_manifest_v2 FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
