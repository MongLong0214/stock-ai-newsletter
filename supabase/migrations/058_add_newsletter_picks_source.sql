BEGIN;

ALTER TABLE public.newsletter_content
  ADD COLUMN picks_source TEXT NULL,
  ADD CONSTRAINT newsletter_content_picks_source_check
    CHECK (picks_source IN ('code', 'llm_fallback', 'crash'));

COMMENT ON COLUMN public.newsletter_content.picks_source IS
  'Newsletter pick origin: code pipeline, LLM fallback, or crash alert';

COMMIT;
