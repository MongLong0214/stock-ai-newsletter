-- ============================================================================
-- Newsletter Content Table
-- Stores prepared newsletter data to separate AI analysis from email sending
-- ============================================================================

-- Create newsletter_content table
CREATE TABLE IF NOT EXISTS newsletter_content (
  -- Primary Key
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Core Data
  newsletter_date DATE NOT NULL UNIQUE,
  gemini_analysis JSONB NOT NULL, -- Gemini API 응답 (JSONB로 쿼리 가능)

  -- Sending Status
  is_sent BOOLEAN DEFAULT false NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  subscriber_count INTEGER DEFAULT 0,

  -- Data Integrity Constraints
  CONSTRAINT sent_at_required_when_sent CHECK (is_sent = false OR sent_at IS NOT NULL),
  CONSTRAINT subscriber_count_non_negative CHECK (subscriber_count >= 0)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup by date (unique already creates index, but explicit for clarity)
CREATE INDEX IF NOT EXISTS idx_newsletter_date ON newsletter_content(newsletter_date DESC);

-- Filter unsent newsletters efficiently
CREATE INDEX IF NOT EXISTS idx_newsletter_unsent ON newsletter_content(is_sent)
  WHERE is_sent = false;

-- Query sent newsletters by date
CREATE INDEX IF NOT EXISTS idx_newsletter_sent_at ON newsletter_content(sent_at DESC)
  WHERE is_sent = true;

-- JSONB 필드 쿼리 최적화 (선택적)
CREATE INDEX IF NOT EXISTS idx_newsletter_gemini_gin ON newsletter_content USING gin(gemini_analysis);

-- ============================================================================
-- Functions
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_newsletter_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_newsletter_content_updated_at ON newsletter_content;
CREATE TRIGGER trigger_newsletter_content_updated_at
  BEFORE UPDATE ON newsletter_content
  FOR EACH ROW
  EXECUTE FUNCTION update_newsletter_content_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE newsletter_content ENABLE ROW LEVEL SECURITY;

-- Service role only: newsletter_content는 내부 데이터이므로 service_role만 접근
CREATE POLICY "Service role has full access" ON newsletter_content
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE newsletter_content IS 'Stores prepared newsletter content to separate AI analysis from email sending';
COMMENT ON COLUMN newsletter_content.newsletter_date IS 'The date for which this newsletter was prepared (unique per day)';
COMMENT ON COLUMN newsletter_content.gemini_analysis IS 'JSONB object of Gemini analysis result (queryable)';
COMMENT ON COLUMN newsletter_content.is_sent IS 'Whether this newsletter has been sent to subscribers';
COMMENT ON COLUMN newsletter_content.sent_at IS 'Timestamp when the newsletter was actually sent';
COMMENT ON COLUMN newsletter_content.subscriber_count IS 'Number of subscribers who received this newsletter (non-negative)';
COMMENT ON COLUMN newsletter_content.updated_at IS 'Last modification timestamp';