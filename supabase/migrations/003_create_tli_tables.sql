-- =====================================================
-- Migration: 003_create_tli_tables.sql
-- Description: Theme Lifecycle Intelligence (TLI) Tables
-- =====================================================

-- =====================================================
-- 1. REUSABLE TRIGGER FUNCTION: updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. TABLE: themes
-- Description: Theme master table
-- =====================================================
CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  name_en VARCHAR(100),
  description TEXT,
  naver_theme_id VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  first_spike_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_themes_is_active ON themes(is_active);

-- Trigger
CREATE TRIGGER set_themes_updated_at
  BEFORE UPDATE ON themes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to themes"
  ON themes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to themes"
  ON themes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 3. TABLE: theme_keywords
-- Description: Theme keyword mappings
-- =====================================================
CREATE TABLE theme_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  keyword VARCHAR(100) NOT NULL,
  source VARCHAR(20) DEFAULT 'general',
  weight DECIMAL(3,2) DEFAULT 1.0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, keyword, source)
);

-- Index
CREATE INDEX idx_theme_keywords_theme_id ON theme_keywords(theme_id);

-- RLS
ALTER TABLE theme_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to theme_keywords"
  ON theme_keywords FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to theme_keywords"
  ON theme_keywords FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 4. TABLE: theme_stocks
-- Description: Theme-stock mappings
-- =====================================================
CREATE TABLE theme_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  market VARCHAR(10) DEFAULT 'KOSPI',
  source VARCHAR(20) DEFAULT 'naver',
  is_curated BOOLEAN DEFAULT false,
  relevance DECIMAL(3,2) DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, symbol)
);

-- Indexes
CREATE INDEX idx_theme_stocks_theme_id ON theme_stocks(theme_id);
CREATE INDEX idx_theme_stocks_symbol ON theme_stocks(symbol);

-- Trigger
CREATE TRIGGER set_theme_stocks_updated_at
  BEFORE UPDATE ON theme_stocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE theme_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to theme_stocks"
  ON theme_stocks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to theme_stocks"
  ON theme_stocks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 5. TABLE: interest_metrics
-- Description: Search interest time-series
-- =====================================================
CREATE TABLE interest_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  time DATE NOT NULL,
  source VARCHAR(20) NOT NULL,
  raw_value INTEGER,
  normalized DECIMAL(5,2),
  UNIQUE(theme_id, time, source)
);

-- Index
CREATE INDEX idx_interest_metrics_theme_time ON interest_metrics(theme_id, time DESC);

-- RLS
ALTER TABLE interest_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to interest_metrics"
  ON interest_metrics FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to interest_metrics"
  ON interest_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 6. TABLE: news_metrics
-- Description: News volume time-series
-- =====================================================
CREATE TABLE news_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  time DATE NOT NULL,
  article_count INTEGER DEFAULT 0,
  growth_rate DECIMAL(6,2),
  UNIQUE(theme_id, time)
);

-- Index
CREATE INDEX idx_news_metrics_theme_time ON news_metrics(theme_id, time DESC);

-- RLS
ALTER TABLE news_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to news_metrics"
  ON news_metrics FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to news_metrics"
  ON news_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 7. TABLE: lifecycle_scores
-- Description: Calculated lifecycle scores
-- =====================================================
CREATE TABLE lifecycle_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  calculated_at DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  stage VARCHAR(20) NOT NULL,
  is_reigniting BOOLEAN DEFAULT false,
  stage_changed BOOLEAN DEFAULT false,
  prev_stage VARCHAR(20),
  components JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, calculated_at)
);

-- Indexes
CREATE INDEX idx_lifecycle_scores_theme_calc ON lifecycle_scores(theme_id, calculated_at DESC);
CREATE INDEX idx_lifecycle_scores_stage ON lifecycle_scores(stage);

-- RLS
ALTER TABLE lifecycle_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to lifecycle_scores"
  ON lifecycle_scores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to lifecycle_scores"
  ON lifecycle_scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 8. TABLE: theme_comparisons
-- Description: Past theme comparison data
-- =====================================================
CREATE TABLE theme_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  current_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  past_theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  similarity_score DECIMAL(4,3),
  current_day INTEGER,
  past_peak_day INTEGER,
  past_total_days INTEGER,
  message TEXT,
  calculated_at DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(current_theme_id, past_theme_id, calculated_at)
);

-- Index
CREATE INDEX idx_theme_comparisons_current_calc ON theme_comparisons(current_theme_id, calculated_at DESC);

-- RLS
ALTER TABLE theme_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to theme_comparisons"
  ON theme_comparisons FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to theme_comparisons"
  ON theme_comparisons FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
