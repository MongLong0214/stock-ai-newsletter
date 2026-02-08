-- =====================================================
-- Migration: 004_add_discovery_columns.sql
-- Description: 동적 테마 발견을 위한 컬럼 추가
-- =====================================================

-- themes 테이블에 발견 관련 컬럼 추가
ALTER TABLE themes
  ADD COLUMN IF NOT EXISTS discovery_source VARCHAR(30) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_on_naver DATE,
  ADD COLUMN IF NOT EXISTS auto_activated BOOLEAN DEFAULT false;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_themes_discovery_source ON themes(discovery_source);
CREATE INDEX IF NOT EXISTS idx_themes_last_seen ON themes(last_seen_on_naver);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
