-- Add 3-Pillar decomposed similarity scores and outcome context to theme_comparisons
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS feature_sim REAL;
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS curve_sim REAL;
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS keyword_sim REAL;
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS past_peak_score INTEGER;
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS past_final_stage TEXT;
ALTER TABLE theme_comparisons ADD COLUMN IF NOT EXISTS past_decline_days INTEGER;
