-- TCAR-002: Phase 0 Bridge Schema and Control Tables
-- Creates 7 artifact tables for the analog retrieval pipeline.
-- All tables are service-role only (no public access).

-- ============================================================
-- 1. episode_registry_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS episode_registry_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id TEXT NOT NULL REFERENCES themes(id),
  episode_number INTEGER NOT NULL,
  boundary_source_start TEXT NOT NULL CHECK (boundary_source_start IN ('observed', 'inferred-v1', 'imported')),
  boundary_source_end TEXT CHECK (boundary_source_end IN ('observed', 'inferred-v1', 'imported')),
  episode_start DATE NOT NULL,
  episode_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  multi_peak BOOLEAN NOT NULL DEFAULT false,
  primary_peak_date DATE,
  peak_score DOUBLE PRECISION,
  policy_versions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(theme_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episode_registry_v1_by_theme_id
  ON episode_registry_v1(theme_id);
CREATE INDEX IF NOT EXISTS idx_episode_registry_v1_by_theme_active
  ON episode_registry_v1(theme_id, is_active);
CREATE INDEX IF NOT EXISTS idx_episode_registry_v1_by_episode_start
  ON episode_registry_v1(episode_start);

ALTER TABLE episode_registry_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_episode_registry_v1" ON episode_registry_v1;
CREATE POLICY "service_role_episode_registry_v1" ON episode_registry_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 2. query_snapshot_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS query_snapshot_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episode_registry_v1(id),
  theme_id TEXT NOT NULL REFERENCES themes(id),
  snapshot_date DATE NOT NULL,
  source_data_cutoff DATE NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  lifecycle_score DOUBLE PRECISION NOT NULL,
  stage TEXT NOT NULL,
  days_since_episode_start INTEGER NOT NULL,
  policy_versions JSONB NOT NULL,
  reconstruction_status TEXT NOT NULL DEFAULT 'success' CHECK (reconstruction_status IN ('success', 'partial', 'failed')),
  reconstruction_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(episode_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_query_snapshot_v1_by_episode_id
  ON query_snapshot_v1(episode_id);
CREATE INDEX IF NOT EXISTS idx_query_snapshot_v1_by_theme_snapshot
  ON query_snapshot_v1(theme_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_query_snapshot_v1_by_source_cutoff
  ON query_snapshot_v1(source_data_cutoff);

ALTER TABLE query_snapshot_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_query_snapshot_v1" ON query_snapshot_v1;
CREATE POLICY "service_role_query_snapshot_v1" ON query_snapshot_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 3. label_table_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS label_table_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episode_registry_v1(id),
  theme_id TEXT NOT NULL REFERENCES themes(id),
  boundary_source TEXT NOT NULL CHECK (boundary_source IN ('observed', 'inferred-v1', 'imported')),
  source_data_cutoff DATE NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  peak_date DATE,
  peak_score DOUBLE PRECISION,
  days_to_peak INTEGER,
  post_peak_drawdown_10d DOUBLE PRECISION,
  post_peak_drawdown_20d DOUBLE PRECISION,
  stage_at_peak TEXT,
  is_promotion_eligible BOOLEAN NOT NULL DEFAULT false,
  promotion_ineligible_reason TEXT,
  policy_versions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(episode_id)
);

CREATE INDEX IF NOT EXISTS idx_label_table_v1_by_episode_id
  ON label_table_v1(episode_id);
CREATE INDEX IF NOT EXISTS idx_label_table_v1_by_theme_id
  ON label_table_v1(theme_id);
CREATE INDEX IF NOT EXISTS idx_label_table_v1_by_source_cutoff
  ON label_table_v1(source_data_cutoff);
CREATE INDEX IF NOT EXISTS idx_label_table_v1_by_promotion_eligible
  ON label_table_v1(is_promotion_eligible);

ALTER TABLE label_table_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_label_table_v1" ON label_table_v1;
CREATE POLICY "service_role_label_table_v1" ON label_table_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 4. analog_candidates_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS analog_candidates_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_snapshot_id UUID NOT NULL REFERENCES query_snapshot_v1(id),
  query_theme_id TEXT NOT NULL REFERENCES themes(id),
  candidate_episode_id UUID NOT NULL REFERENCES episode_registry_v1(id),
  candidate_theme_id TEXT NOT NULL REFERENCES themes(id),
  rank INTEGER NOT NULL,
  retrieval_surface TEXT NOT NULL CHECK (retrieval_surface IN ('price_volume_knn', 'dtw_baseline', 'regime_filtered_nn', 'future_aligned_reranker')),
  similarity_score DOUBLE PRECISION NOT NULL,
  feature_sim DOUBLE PRECISION,
  curve_sim DOUBLE PRECISION,
  keyword_sim DOUBLE PRECISION,
  dtw_distance DOUBLE PRECISION,
  regime_match BOOLEAN NOT NULL DEFAULT false,
  is_future_aligned BOOLEAN NOT NULL DEFAULT false,
  reranker_score DOUBLE PRECISION,
  reranker_version TEXT,
  policy_versions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(query_snapshot_id, candidate_episode_id, retrieval_surface)
);

-- Composite unique for FK integrity: evidence must reference matching snapshot/candidate pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_analog_candidates_v1_id_snapshot
  ON analog_candidates_v1(id, query_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_analog_candidates_v1_by_query_snapshot
  ON analog_candidates_v1(query_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_analog_candidates_v1_by_candidate_episode
  ON analog_candidates_v1(candidate_episode_id);
CREATE INDEX IF NOT EXISTS idx_analog_candidates_v1_by_retrieval_surface
  ON analog_candidates_v1(retrieval_surface);

ALTER TABLE analog_candidates_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_analog_candidates_v1" ON analog_candidates_v1;
CREATE POLICY "service_role_analog_candidates_v1" ON analog_candidates_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 5. analog_evidence_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS analog_evidence_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_snapshot_id UUID NOT NULL,
  query_theme_id TEXT NOT NULL REFERENCES themes(id),
  candidate_id UUID NOT NULL,
  candidate_episode_id UUID NOT NULL REFERENCES episode_registry_v1(id),
  -- Composite FK ensures candidate belongs to the same snapshot
  FOREIGN KEY (candidate_id, query_snapshot_id)
    REFERENCES analog_candidates_v1(id, query_snapshot_id),
  analog_future_path_summary JSONB NOT NULL,
  retrieval_reason TEXT NOT NULL,
  mismatch_summary TEXT,
  evidence_quality TEXT NOT NULL CHECK (evidence_quality IN ('high', 'medium', 'low')),
  evidence_quality_score DOUBLE PRECISION NOT NULL,
  analog_support_count INTEGER NOT NULL,
  candidate_concentration_gini DOUBLE PRECISION NOT NULL,
  top1_analog_weight DOUBLE PRECISION NOT NULL,
  policy_versions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analog_evidence_v1_by_query_snapshot
  ON analog_evidence_v1(query_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_analog_evidence_v1_by_candidate
  ON analog_evidence_v1(candidate_id);
CREATE INDEX IF NOT EXISTS idx_analog_evidence_v1_by_evidence_quality
  ON analog_evidence_v1(evidence_quality);

ALTER TABLE analog_evidence_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_analog_evidence_v1" ON analog_evidence_v1;
CREATE POLICY "service_role_analog_evidence_v1" ON analog_evidence_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 6. forecast_control_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS forecast_control_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_version TEXT NOT NULL DEFAULT 'forecast_control_v1',
  production_version TEXT NOT NULL,
  serving_status TEXT NOT NULL DEFAULT 'shadow' CHECK (serving_status IN ('shadow', 'canary', 'production', 'rolled_back', 'disabled')),
  cutover_ready BOOLEAN NOT NULL DEFAULT false,
  rollback_target_version TEXT,
  rollback_drill_count INTEGER NOT NULL DEFAULT 0,
  rollback_drill_last_success TIMESTAMPTZ,
  fail_closed_verified BOOLEAN NOT NULL DEFAULT false,
  ship_verdict_artifact_id TEXT,
  policy_versions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_control_v1_by_serving_status
  ON forecast_control_v1(serving_status);
CREATE INDEX IF NOT EXISTS idx_forecast_control_v1_by_production_version
  ON forecast_control_v1(production_version);

ALTER TABLE forecast_control_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_forecast_control_v1" ON forecast_control_v1;
CREATE POLICY "service_role_forecast_control_v1" ON forecast_control_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;

-- ============================================================
-- 7. bridge_run_audits_v1
-- ============================================================
CREATE TABLE IF NOT EXISTS bridge_run_audits_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_version TEXT NOT NULL DEFAULT 'bridge_run_audits_v1',
  run_date DATE NOT NULL,
  bridge_row TEXT NOT NULL CHECK (bridge_row IN ('episode_registry', 'query_snapshot_label', 'analog_candidates_evidence', 'forecast_control')),
  parity JSONB NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'pending', 'pending_not_materialized')),
  cutover_eligible BOOLEAN NOT NULL DEFAULT false,
  rollback_triggered BOOLEAN NOT NULL DEFAULT false,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_run_audits_v1_by_run_date
  ON bridge_run_audits_v1(run_date);
CREATE INDEX IF NOT EXISTS idx_bridge_run_audits_v1_by_bridge_row
  ON bridge_run_audits_v1(bridge_row);
CREATE INDEX IF NOT EXISTS idx_bridge_run_audits_v1_by_verdict
  ON bridge_run_audits_v1(verdict);

ALTER TABLE bridge_run_audits_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bridge_run_audits_v1" ON bridge_run_audits_v1;
CREATE POLICY "service_role_bridge_run_audits_v1" ON bridge_run_audits_v1
  FOR ALL USING (true) WITH CHECK (true)
  TO service_role;
