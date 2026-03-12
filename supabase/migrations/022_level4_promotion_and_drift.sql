ALTER TABLE comparison_v4_control
  ADD COLUMN IF NOT EXISTS source_surface TEXT NOT NULL DEFAULT 'v2_certification',
  ADD COLUMN IF NOT EXISTS calibration_version TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS weight_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS drift_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS promotion_gate_status TEXT NOT NULL DEFAULT 'passed',
  ADD COLUMN IF NOT EXISTS promotion_gate_summary TEXT NULL,
  ADD COLUMN IF NOT EXISTS promotion_gate_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS previous_stable_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS rollback_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_hold_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_state TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS hold_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS hold_report_date DATE NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS decision_trace JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE comparison_v4_control
  DROP CONSTRAINT IF EXISTS comparison_v4_control_source_surface_check;
ALTER TABLE comparison_v4_control
  ADD CONSTRAINT comparison_v4_control_source_surface_check
  CHECK (source_surface IN ('legacy_diagnostic', 'v2_certification', 'replay_equivalent'));

ALTER TABLE comparison_v4_control
  DROP CONSTRAINT IF EXISTS comparison_v4_control_gate_status_check;
ALTER TABLE comparison_v4_control
  ADD CONSTRAINT comparison_v4_control_gate_status_check
  CHECK (promotion_gate_status IN ('passed', 'failed', 'blocked', 'rolled_back'));

ALTER TABLE comparison_v4_control
  DROP CONSTRAINT IF EXISTS comparison_v4_control_hold_state_check;
ALTER TABLE comparison_v4_control
  ADD CONSTRAINT comparison_v4_control_hold_state_check
  CHECK (hold_state IN ('inactive', 'active', 'observation_only'));

CREATE TABLE IF NOT EXISTS drift_report_artifact (
  drift_version TEXT PRIMARY KEY,
  report_date DATE NOT NULL,
  source_surface TEXT NOT NULL,
  relevance_base_rate DOUBLE PRECISION NOT NULL,
  calibration_curve_error DOUBLE PRECISION NOT NULL,
  brier DOUBLE PRECISION NOT NULL,
  ece DOUBLE PRECISION NOT NULL,
  candidate_concentration_gini DOUBLE PRECISION NOT NULL,
  censoring_ratio DOUBLE PRECISION NOT NULL,
  first_spike_inference_rate DOUBLE PRECISION NOT NULL,
  support_bucket_precision JSONB NOT NULL,
  baseline_window_months INTEGER NOT NULL,
  baseline_row_count INTEGER NOT NULL,
  auto_hold_enabled BOOLEAN NOT NULL DEFAULT false,
  drift_status TEXT NOT NULL,
  triggered_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drift_report_artifact
  DROP CONSTRAINT IF EXISTS drift_report_artifact_source_surface_check;
ALTER TABLE drift_report_artifact
  ADD CONSTRAINT drift_report_artifact_source_surface_check
  CHECK (source_surface IN ('v2_certification', 'replay_equivalent'));

ALTER TABLE drift_report_artifact
  DROP CONSTRAINT IF EXISTS drift_report_artifact_status_check;
ALTER TABLE drift_report_artifact
  ADD CONSTRAINT drift_report_artifact_status_check
  CHECK (drift_status IN ('stable', 'hold', 'observation_only'));

ALTER TABLE drift_report_artifact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access to drift_report_artifact" ON drift_report_artifact;
CREATE POLICY "Allow service role full access to drift_report_artifact"
  ON drift_report_artifact FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
