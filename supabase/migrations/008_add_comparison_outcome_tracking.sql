-- 비교 결과 추적 컬럼 추가
ALTER TABLE theme_comparisons
  ADD COLUMN IF NOT EXISTS outcome_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trajectory_correlation REAL,
  ADD COLUMN IF NOT EXISTS stage_match BOOLEAN,
  ADD COLUMN IF NOT EXISTS verified_at DATE;

-- 캘리브레이션 일간 요약 테이블
CREATE TABLE IF NOT EXISTS comparison_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at DATE NOT NULL UNIQUE,
  total_verified INTEGER NOT NULL DEFAULT 0,
  avg_trajectory_corr REAL,
  stage_match_rate REAL,
  feature_corr_when_accurate REAL,
  curve_corr_when_accurate REAL,
  keyword_corr_when_accurate REAL,
  feature_corr_when_inaccurate REAL,
  curve_corr_when_inaccurate REAL,
  keyword_corr_when_inaccurate REAL,
  suggested_threshold REAL,
  suggested_sector_penalty REAL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
