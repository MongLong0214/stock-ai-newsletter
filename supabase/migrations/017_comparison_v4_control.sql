-- =====================================================
-- Migration: 017_comparison_v4_control.sql
-- Description: Comparison v4 serving control pointer
-- =====================================================

CREATE TABLE IF NOT EXISTS comparison_v4_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_version TEXT NOT NULL,
  serving_enabled BOOLEAN NOT NULL DEFAULT false,
  promoted_by TEXT NOT NULL DEFAULT 'system',
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (production_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comparison_v4_control_single_enabled
  ON comparison_v4_control((serving_enabled))
  WHERE serving_enabled = true;

ALTER TABLE comparison_v4_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to comparison_v4_control"
  ON comparison_v4_control FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
