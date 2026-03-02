-- TLI Scientific Rigor Upgrade: calibration tables + prediction intervals

-- Weight calibration history (Shannon Entropy)
CREATE TABLE IF NOT EXISTS weight_calibration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  calculated_at DATE NOT NULL,
  interest_weight NUMERIC(5,3) NOT NULL,
  news_weight NUMERIC(5,3) NOT NULL,
  volatility_weight NUMERIC(5,3) NOT NULL,
  activity_weight NUMERIC(5,3) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'shannon_entropy',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_weight_calibration_date UNIQUE (calculated_at)
);

-- Stage calibration history (KDE valley detection)
CREATE TABLE IF NOT EXISTS stage_calibration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  calculated_at DATE NOT NULL,
  dormant_threshold NUMERIC(5,1) NOT NULL,
  emerging_threshold NUMERIC(5,1) NOT NULL,
  growth_threshold NUMERIC(5,1) NOT NULL,
  peak_threshold NUMERIC(5,1) NOT NULL,
  bandwidth NUMERIC(8,4),
  valley_count INTEGER,
  sample_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_stage_calibration_date UNIQUE (calculated_at)
);

-- Confidence calibration history (ECE minimization + noise ROC)
CREATE TABLE IF NOT EXISTS confidence_calibration (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  calculated_at DATE NOT NULL,
  calibration_type TEXT NOT NULL DEFAULT 'confidence_thresholds',
  -- confidence threshold fields
  high_coverage NUMERIC(4,2),
  high_days INTEGER,
  medium_coverage NUMERIC(4,2),
  medium_days INTEGER,
  ece NUMERIC(6,4),
  -- noise threshold fields
  threshold_value NUMERIC(6,2),
  auc NUMERIC(6,4),
  youden_j NUMERIC(6,4),
  -- common
  sample_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_confidence_calibration_date_type UNIQUE (calculated_at, calibration_type)
);

-- Add prediction intervals to prediction_snapshots
ALTER TABLE prediction_snapshots
  ADD COLUMN IF NOT EXISTS prediction_intervals JSONB;

-- RLS policies (match existing patterns)
ALTER TABLE weight_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on weight_calibration"
  ON weight_calibration FOR SELECT USING (true);
CREATE POLICY "Allow public read on stage_calibration"
  ON stage_calibration FOR SELECT USING (true);
CREATE POLICY "Allow public read on confidence_calibration"
  ON confidence_calibration FOR SELECT USING (true);
