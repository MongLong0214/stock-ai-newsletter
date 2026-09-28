BEGIN;

CREATE FUNCTION public.tli_latest_lifecycle_scores(
  p_theme_ids UUID[], p_before DATE, p_limit INTEGER
)
RETURNS TABLE (
  theme_id UUID,
  stage VARCHAR,
  score INTEGER,
  smoothed_score INTEGER,
  raw_score INTEGER,
  components JSONB,
  calculated_at DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 50'
      USING ERRCODE = '22023';
  END IF;
  IF p_theme_ids IS NULL OR cardinality(p_theme_ids) > 300 THEN
    RAISE EXCEPTION 'p_theme_ids must contain at most 300 themes'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT s.theme_id, s.stage, s.score, s.smoothed_score, s.raw_score,
         s.components, s.calculated_at
  FROM unnest(p_theme_ids) AS t(theme_id)
  CROSS JOIN LATERAL (
    SELECT score.theme_id, score.stage, score.score, score.smoothed_score,
           score.raw_score, score.components, score.calculated_at
    FROM public.lifecycle_scores AS score
    WHERE score.theme_id = t.theme_id
      AND score.calculated_at < p_before
    ORDER BY score.calculated_at DESC
    LIMIT p_limit
  ) AS s
  ORDER BY s.theme_id, s.calculated_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.tli_latest_lifecycle_scores(UUID[], DATE, INTEGER) IS
  'Returns each requested theme''s latest lifecycle scores before a date, bounded by the per-theme limit.';

COMMIT;
