-- ============================================================================
-- Blog Posts Table for SEO Content Automation
-- Enterprise-grade schema with full-text search and performance optimization
-- ============================================================================

-- Create enum for post status
DO $$ BEGIN
  CREATE TYPE blog_post_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  -- Primary Key
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Core Content
  slug VARCHAR(255) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  content TEXT NOT NULL,

  -- SEO Metadata
  meta_title VARCHAR(70),
  meta_description VARCHAR(160),
  canonical_url VARCHAR(500),

  -- Categorization
  target_keyword VARCHAR(255) NOT NULL,
  secondary_keywords TEXT[],
  category VARCHAR(100) DEFAULT 'stock-newsletter',
  tags TEXT[],

  -- Content Generation Metadata
  competitor_urls TEXT[],
  competitor_count INTEGER DEFAULT 0,
  generation_prompt TEXT,

  -- Publishing
  status blog_post_status DEFAULT 'draft' NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,

  -- Performance Tracking
  view_count INTEGER DEFAULT 0,

  -- Schema.org Structured Data
  schema_data JSONB,

  -- FAQ Section (for FAQ Schema)
  faq_items JSONB,

  -- Internal Linking
  related_posts UUID[],

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Data Integrity Constraints
  CONSTRAINT published_at_required_when_published CHECK (status != 'published' OR published_at IS NOT NULL),
  CONSTRAINT view_count_non_negative CHECK (view_count >= 0),
  CONSTRAINT competitor_count_non_negative CHECK (competitor_count >= 0)
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at DESC);

-- SEO keyword indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_target_keyword ON blog_posts(target_keyword);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);

-- Full-text search index (simple analyzer for Korean + English mixed content)
CREATE INDEX IF NOT EXISTS idx_blog_posts_fts ON blog_posts
  USING gin(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(content, '')));

-- GIN index for array fields
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON blog_posts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_blog_posts_secondary_keywords ON blog_posts USING gin(secondary_keywords);

-- Composite index for common queries (published posts list)
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at DESC)
  WHERE status = 'published';

-- ============================================================================
-- Functions
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER trigger_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_blog_posts_updated_at();

-- Function to increment view count (atomic, secure)
CREATE OR REPLACE FUNCTION increment_blog_view_count(post_slug VARCHAR)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  -- Validate input
  IF post_slug IS NULL OR post_slug = '' THEN
    RETURN false;
  END IF;

  -- Only increment for published posts
  UPDATE blog_posts
  SET view_count = view_count + 1
  WHERE slug = post_slug
    AND status = 'published';

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts only
CREATE POLICY "Public can read published posts" ON blog_posts
  FOR SELECT
  USING (status = 'published');

-- Service role can do everything
CREATE POLICY "Service role has full access" ON blog_posts
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE blog_posts IS 'SEO-optimized blog posts for content automation pipeline';
COMMENT ON COLUMN blog_posts.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN blog_posts.target_keyword IS 'Primary SEO keyword for this post';
COMMENT ON COLUMN blog_posts.secondary_keywords IS 'Related keywords for LSI SEO';
COMMENT ON COLUMN blog_posts.competitor_urls IS 'Source URLs analyzed during content generation';
COMMENT ON COLUMN blog_posts.schema_data IS 'Schema.org structured data for rich snippets';
COMMENT ON COLUMN blog_posts.faq_items IS 'FAQ items for FAQ Schema markup [{question, answer}]';
COMMENT ON COLUMN blog_posts.view_count IS 'Page view count (non-negative, updated atomically)';
COMMENT ON FUNCTION increment_blog_view_count IS 'Atomically increment view count for published posts only';