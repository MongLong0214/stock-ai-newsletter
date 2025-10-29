-- Create newsletter_content table for storing prepared newsletter data
CREATE TABLE IF NOT EXISTS newsletter_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  newsletter_date DATE NOT NULL UNIQUE,
  gemini_analysis TEXT NOT NULL,
  is_sent BOOLEAN DEFAULT false NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  subscriber_count INTEGER DEFAULT 0
);

-- Create index on newsletter_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_date ON newsletter_content(newsletter_date);

-- Create index on is_sent for filtering unsent newsletters
CREATE INDEX IF NOT EXISTS idx_is_sent ON newsletter_content(is_sent);

-- Add comment to table
COMMENT ON TABLE newsletter_content IS 'Stores prepared newsletter content to separate AI analysis from email sending';
COMMENT ON COLUMN newsletter_content.newsletter_date IS 'The date for which this newsletter was prepared (unique per day)';
COMMENT ON COLUMN newsletter_content.gemini_analysis IS 'JSON string of Gemini analysis result';
COMMENT ON COLUMN newsletter_content.is_sent IS 'Whether this newsletter has been sent to subscribers';
COMMENT ON COLUMN newsletter_content.sent_at IS 'Timestamp when the newsletter was actually sent';
COMMENT ON COLUMN newsletter_content.subscriber_count IS 'Number of subscribers who received this newsletter';