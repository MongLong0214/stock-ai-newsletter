-- =====================================================
-- Migration: 005_add_stock_prices_and_news_articles.sql
-- Description: Add stock price columns and news articles table
-- =====================================================

-- 1. ALTER theme_stocks: add price/volume columns
ALTER TABLE theme_stocks
  ADD COLUMN IF NOT EXISTS current_price INTEGER,
  ADD COLUMN IF NOT EXISTS price_change_pct REAL,
  ADD COLUMN IF NOT EXISTS volume BIGINT;

-- 2. CREATE theme_news_articles table
CREATE TABLE IF NOT EXISTS theme_news_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  source TEXT,
  pub_date DATE NOT NULL,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_id, link)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_theme_news_articles_theme_id ON theme_news_articles(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_news_articles_pub_date ON theme_news_articles(pub_date DESC);

-- RLS
ALTER TABLE theme_news_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to theme_news_articles"
  ON theme_news_articles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow service role full access to theme_news_articles"
  ON theme_news_articles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
