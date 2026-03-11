-- PRD §6.4: Add theme_definition_version and lifecycle_score_version to run records
-- These columns track exact versions of upstream data definitions used for each run

ALTER TABLE theme_comparison_runs_v2
  ADD COLUMN IF NOT EXISTS theme_definition_version TEXT NOT NULL DEFAULT 'theme-def-v2.0',
  ADD COLUMN IF NOT EXISTS lifecycle_score_version TEXT NOT NULL DEFAULT 'lifecycle-score-v2.0';

-- Also add to backfill manifest's source tracking
ALTER TABLE comparison_backfill_manifest_v2
  ADD COLUMN IF NOT EXISTS theme_definition_version TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_score_version TEXT;
