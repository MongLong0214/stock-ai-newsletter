-- =====================================================
-- Migration: 010_create_community_metrics.sql
-- Description: Community buzz metrics (blog mentions + stock discussion)
-- Date: 2026-02-17
-- =====================================================

CREATE TABLE community_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  time DATE NOT NULL,
  source VARCHAR(30) NOT NULL,          -- 'blog' | 'discussion'
  mention_count INTEGER DEFAULT 0,
  stock_count INTEGER DEFAULT 0,        -- 종목토론방: 테마 내 전체 종목 수
  stocks_sampled INTEGER DEFAULT 0,     -- 종목토론방: 실제 수집한 종목 수
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, time, source)
);

-- Index
CREATE INDEX idx_community_metrics_theme_time ON community_metrics(theme_id, time DESC);

-- RLS
ALTER TABLE community_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to community_metrics"
  ON community_metrics FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to community_metrics"
  ON community_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
