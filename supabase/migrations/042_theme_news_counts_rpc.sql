BEGIN;

CREATE OR REPLACE FUNCTION public.get_theme_news_counts(
  p_theme_ids uuid[],
  p_since date
)
RETURNS TABLE (
  theme_id uuid,
  news_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT tna.theme_id, count(*) AS news_count
  FROM public.theme_news_articles AS tna
  WHERE tna.theme_id = ANY(p_theme_ids)
    AND tna.pub_date >= p_since
  GROUP BY tna.theme_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_theme_news_counts(uuid[], date) TO anon, authenticated, service_role;

COMMIT;
