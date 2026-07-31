BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Public read paths use these bounded RPCs instead of applying one global
-- PostgREST row limit before selecting the newest row for each theme.
CREATE OR REPLACE FUNCTION public.load_theme_score_windows(
  p_theme_ids UUID[],
  p_recent_since DATE,
  p_previous_on_or_before DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  theme_id UUID,
  score INTEGER,
  stage TEXT,
  is_reigniting BOOLEAN,
  calculated_at DATE,
  components JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_recent_since IS NULL THEN
    RAISE EXCEPTION 'p_recent_since is required' USING ERRCODE = '22004';
  END IF;

  IF COALESCE(cardinality(p_theme_ids), 0) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_theme_ids) > 500 THEN
    RAISE EXCEPTION 'theme score window request exceeds 500 themes' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT DISTINCT requested_id AS theme_id
    FROM unnest(p_theme_ids) AS requested_id
  ),
  latest_rows AS (
    SELECT DISTINCT ON (s.theme_id)
      s.id,
      s.theme_id,
      s.score,
      s.stage::TEXT AS stage,
      COALESCE(s.is_reigniting, false) AS is_reigniting,
      s.calculated_at,
      s.components
    FROM public.lifecycle_scores AS s
    INNER JOIN requested AS r ON r.theme_id = s.theme_id
    ORDER BY s.theme_id, s.calculated_at DESC, s.id DESC
  ),
  recent_rows AS (
    SELECT
      s.id,
      s.theme_id,
      s.score,
      s.stage::TEXT AS stage,
      COALESCE(s.is_reigniting, false) AS is_reigniting,
      s.calculated_at,
      s.components
    FROM public.lifecycle_scores AS s
    INNER JOIN requested AS r ON r.theme_id = s.theme_id
    WHERE s.calculated_at >= p_recent_since
  ),
  previous_rows AS (
    SELECT DISTINCT ON (s.theme_id)
      s.id,
      s.theme_id,
      s.score,
      s.stage::TEXT AS stage,
      COALESCE(s.is_reigniting, false) AS is_reigniting,
      s.calculated_at,
      s.components
    FROM public.lifecycle_scores AS s
    INNER JOIN requested AS r ON r.theme_id = s.theme_id
    WHERE s.calculated_at <= COALESCE(p_previous_on_or_before, p_recent_since)
    ORDER BY s.theme_id, s.calculated_at DESC, s.id DESC
  ),
  combined AS (
    SELECT * FROM latest_rows
    UNION ALL
    SELECT * FROM recent_rows
    UNION ALL
    SELECT * FROM previous_rows
  ),
  deduplicated AS (
    SELECT DISTINCT ON (c.id)
      c.id,
      c.theme_id,
      c.score,
      c.stage,
      c.is_reigniting,
      c.calculated_at,
      c.components
    FROM combined AS c
    ORDER BY c.id
  )
  SELECT
    d.id,
    d.theme_id,
    d.score,
    d.stage,
    d.is_reigniting,
    d.calculated_at,
    d.components
  FROM deduplicated AS d
  ORDER BY d.calculated_at DESC, d.theme_id, d.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.load_theme_score_windows(UUID[], DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_theme_score_windows(UUID[], DATE, DATE)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.load_latest_published_comparison_runs(
  p_theme_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  current_theme_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(cardinality(p_theme_ids), 0) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_theme_ids) > 100 THEN
    RAISE EXCEPTION 'latest comparison run request exceeds 100 themes' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (r.current_theme_id)
    r.id,
    r.current_theme_id,
    r.created_at
  FROM public.theme_comparison_runs_v2 AS r
  WHERE r.current_theme_id = ANY(p_theme_ids)
    AND r.status = 'published'
    AND r.publish_ready = true
  ORDER BY r.current_theme_id, r.created_at DESC, r.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.load_latest_published_comparison_runs(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_latest_published_comparison_runs(UUID[])
  TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_comparison_runs_latest_published_theme
  ON public.theme_comparison_runs_v2 (current_theme_id, created_at DESC, id DESC)
  WHERE status = 'published' AND publish_ready = true;

CREATE INDEX IF NOT EXISTS idx_themes_active_name_trgm
  ON public.themes USING gin (name extensions.gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_themes_active_name_en_trgm
  ON public.themes USING gin (name_en extensions.gin_trgm_ops)
  WHERE is_active = true AND name_en IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_theme_stocks_active_name_trgm
  ON public.theme_stocks USING gin (name extensions.gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_theme_stocks_active_symbol_trgm
  ON public.theme_stocks USING gin (symbol extensions.gin_trgm_ops)
  WHERE is_active = true;

COMMIT;
