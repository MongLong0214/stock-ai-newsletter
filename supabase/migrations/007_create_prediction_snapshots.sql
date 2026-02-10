-- Prediction snapshots for tracking and evaluating prediction accuracy
CREATE TABLE IF NOT EXISTS prediction_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,

  -- Prediction inputs
  comparison_count INTEGER NOT NULL,
  avg_similarity REAL NOT NULL,

  -- Prediction outputs
  phase TEXT NOT NULL,
  confidence TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  momentum TEXT NOT NULL,
  avg_peak_day INTEGER NOT NULL,
  avg_total_days INTEGER NOT NULL,
  avg_days_to_peak INTEGER NOT NULL,
  current_progress REAL NOT NULL,
  days_since_spike INTEGER NOT NULL,

  -- Scenarios
  best_scenario JSONB,
  median_scenario JSONB,
  worst_scenario JSONB,

  -- Evaluation (filled later)
  status TEXT NOT NULL DEFAULT 'pending',
  evaluated_at TIMESTAMPTZ,
  actual_score INTEGER,
  actual_stage TEXT,
  phase_correct BOOLEAN,
  peak_timing_error_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(theme_id, snapshot_date)
);

CREATE INDEX idx_prediction_snapshots_theme_date ON prediction_snapshots(theme_id, snapshot_date);
CREATE INDEX idx_prediction_snapshots_status ON prediction_snapshots(status);
