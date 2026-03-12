CREATE TABLE IF NOT EXISTS weight_artifact (
  weight_version TEXT PRIMARY KEY,
  source_surface TEXT NOT NULL,
  w_feature DOUBLE PRECISION NOT NULL,
  w_curve DOUBLE PRECISION NOT NULL,
  w_keyword DOUBLE PRECISION NOT NULL,
  sector_penalty DOUBLE PRECISION NOT NULL,
  curve_bucket_policy JSONB NOT NULL,
  validation_metric_summary JSONB NOT NULL,
  ci_lower DOUBLE PRECISION NOT NULL,
  ci_upper DOUBLE PRECISION NOT NULL,
  ci_method TEXT NOT NULL,
  bootstrap_iterations INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE weight_artifact
  DROP CONSTRAINT IF EXISTS weight_artifact_source_surface_check;
ALTER TABLE weight_artifact
  ADD CONSTRAINT weight_artifact_source_surface_check
  CHECK (source_surface IN ('v2_certification', 'replay_equivalent'));

ALTER TABLE weight_artifact ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access to weight_artifact" ON weight_artifact;
CREATE POLICY "Allow service role full access to weight_artifact"
  ON weight_artifact FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
