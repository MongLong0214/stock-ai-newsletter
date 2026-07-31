-- Immutable AI generation provenance for newsletter content.
-- Forward-only: existing newsletter rows remain readable with nullable provenance.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.generation_runs (
  id UUID PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('newsletter')),
  target_date DATE NOT NULL,
  generation_kind TEXT NOT NULL CHECK (generation_kind IN ('stock_recommendation', 'crash_alert')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  model_provider TEXT NOT NULL,
  model_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  prompt_sha256 TEXT NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  grounding_evidence JSONB NOT NULL CHECK (
    jsonb_typeof(grounding_evidence) = 'array'
    AND jsonb_array_length(grounding_evidence) > 0
  ),
  output_content_sha256 TEXT NOT NULL CHECK (output_content_sha256 ~ '^[0-9a-f]{64}$'),
  output_content_length INTEGER NOT NULL CHECK (output_content_length > 0),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (completed_at >= started_at)
);

CREATE INDEX generation_runs_target_idx
  ON public.generation_runs (target_type, target_date, created_at DESC);

ALTER TABLE public.newsletter_content
  ADD COLUMN generation_run_id UUID REFERENCES public.generation_runs(id) ON DELETE RESTRICT,
  ADD COLUMN content_sha256 TEXT CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX newsletter_content_generation_run_uidx
  ON public.newsletter_content (generation_run_id)
  WHERE generation_run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_generation_run_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'generation_runs rows are immutable';
END;
$$;

CREATE TRIGGER generation_runs_immutable
BEFORE UPDATE OR DELETE ON public.generation_runs
FOR EACH ROW EXECUTE FUNCTION public.reject_generation_run_mutation();

CREATE OR REPLACE FUNCTION public.store_newsletter_generation(
  p_run_id UUID,
  p_newsletter_date DATE,
  p_gemini_analysis TEXT,
  p_generation_kind TEXT,
  p_model_provider TEXT,
  p_model_version TEXT,
  p_prompt_version TEXT,
  p_prompt_sha256 TEXT,
  p_grounding_evidence JSONB,
  p_content_sha256 TEXT,
  p_started_at TIMESTAMPTZ,
  p_completed_at TIMESTAMPTZ
)
RETURNS TABLE(content_id UUID, generation_run_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_content_id UUID;
  v_actual_content_sha256 TEXT;
  v_evidence JSONB;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  IF p_run_id IS NULL OR p_newsletter_date IS NULL OR length(p_gemini_analysis) = 0 THEN
    RAISE EXCEPTION 'generation identity, date, and content are required';
  END IF;

  v_actual_content_sha256 := encode(
    extensions.digest(convert_to(p_gemini_analysis, 'UTF8'), 'sha256'),
    'hex'
  );
  IF p_content_sha256 IS DISTINCT FROM v_actual_content_sha256 THEN
    RAISE EXCEPTION 'newsletter content hash mismatch';
  END IF;

  IF p_prompt_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid prompt hash';
  END IF;
  IF jsonb_typeof(p_grounding_evidence) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_grounding_evidence) = 0 THEN
    RAISE EXCEPTION 'grounding evidence array is required';
  END IF;

  FOR v_evidence IN SELECT value FROM jsonb_array_elements(p_grounding_evidence)
  LOOP
    IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'grounding evidence entries must be objects';
    END IF;
    IF NOT (
      COALESCE(v_evidence ->> 'sourceUrl', '') ~ '^https://'
      OR (
        COALESCE(v_evidence ->> 'identitySourceUrl', '') ~ '^https://'
        AND COALESCE(v_evidence ->> 'quoteSourceUrl', '') ~ '^https://'
      )
    ) THEN
      RAISE EXCEPTION 'grounding evidence requires HTTPS source URL(s)';
    END IF;
    IF COALESCE(
      v_evidence ->> 'observedAt',
      v_evidence ->> 'sourceObservedAt',
      v_evidence ->> 'verifiedAt',
      ''
    ) = '' THEN
      RAISE EXCEPTION 'grounding evidence requires an observation timestamp';
    END IF;
  END LOOP;

  INSERT INTO public.generation_runs (
    id,
    target_type,
    target_date,
    generation_kind,
    model_provider,
    model_version,
    prompt_version,
    prompt_sha256,
    grounding_evidence,
    output_content_sha256,
    output_content_length,
    started_at,
    completed_at
  ) VALUES (
    p_run_id,
    'newsletter',
    p_newsletter_date,
    p_generation_kind,
    p_model_provider,
    p_model_version,
    p_prompt_version,
    p_prompt_sha256,
    p_grounding_evidence,
    p_content_sha256,
    octet_length(convert_to(p_gemini_analysis, 'UTF8')),
    p_started_at,
    p_completed_at
  );

  INSERT INTO public.newsletter_content (
    newsletter_date,
    gemini_analysis,
    generation_run_id,
    content_sha256,
    is_sent,
    created_at
  ) VALUES (
    p_newsletter_date,
    p_gemini_analysis,
    p_run_id,
    p_content_sha256,
    false,
    now()
  )
  ON CONFLICT (newsletter_date) DO UPDATE
  SET gemini_analysis = EXCLUDED.gemini_analysis,
      generation_run_id = EXCLUDED.generation_run_id,
      content_sha256 = EXCLUDED.content_sha256,
      created_at = now()
  WHERE public.newsletter_content.is_sent = false
  RETURNING public.newsletter_content.id INTO v_content_id;

  IF v_content_id IS NULL THEN
    RAISE EXCEPTION 'sent newsletter content is immutable';
  END IF;

  RETURN QUERY SELECT v_content_id, p_run_id;
END;
$$;

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY generation_runs_service_insert
  ON public.generation_runs FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY generation_runs_service_select
  ON public.generation_runs FOR SELECT TO service_role
  USING (true);

REVOKE ALL ON TABLE public.generation_runs FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.generation_runs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.generation_runs TO service_role;

REVOKE ALL ON FUNCTION public.reject_generation_run_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_newsletter_generation(
  UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_newsletter_generation(
  UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON TABLE public.generation_runs IS
  'Immutable completed AI generation manifests with model, prompt, grounding, and output hash provenance.';
COMMENT ON COLUMN public.newsletter_content.generation_run_id IS
  'Current immutable generation manifest for this newsletter content.';
COMMENT ON COLUMN public.newsletter_content.content_sha256 IS
  'SHA-256 of the exact UTF-8 gemini_analysis persisted for delivery.';
