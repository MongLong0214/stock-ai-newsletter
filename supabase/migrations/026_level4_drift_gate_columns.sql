ALTER TABLE drift_report_artifact
  ADD COLUMN IF NOT EXISTS baseline_candidate_concentration_gini DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS baseline_censoring_ratio DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS low_confidence_serving_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS hold_report_date DATE;
