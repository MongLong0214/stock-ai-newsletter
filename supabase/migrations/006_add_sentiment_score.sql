-- =====================================================
-- Migration: 006_add_sentiment_score.sql
-- Description: Add sentiment_score column to theme_news_articles
-- =====================================================

ALTER TABLE theme_news_articles
  ADD COLUMN IF NOT EXISTS sentiment_score REAL;
  -- Range: -1.0 (very bearish) to +1.0 (very bullish), NULL = not analyzed

-- Partial index for efficient sentiment aggregation queries
CREATE INDEX IF NOT EXISTS idx_theme_news_articles_sentiment
  ON theme_news_articles(theme_id, pub_date DESC)
  WHERE sentiment_score IS NOT NULL;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
