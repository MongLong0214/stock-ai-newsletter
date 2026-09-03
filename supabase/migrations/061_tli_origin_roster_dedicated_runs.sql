BEGIN;

-- 관측 결과가 우연히 1개 테마뿐인 batch run을 single-theme roster source로
-- 오인하지 않도록 request payload 자체도 dedicated run인지 확인한다.
CREATE OR REPLACE FUNCTION public.tli_origin_roster(p_origin_date DATE)
RETURNS TABLE (
  theme_id UUID,
  run_id UUID,
  keyword_group_hash TEXT,
  request_payload JSONB,
  completed_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked_roster AS (
    SELECT DISTINCT ON (single_theme.theme_id)
      single_theme.theme_id,
      run.id AS run_id,
      run.keyword_group_hash,
      run.request_payload,
      run.completed_at
    FROM public.tli_collection_runs AS run
    CROSS JOIN LATERAL (
      SELECT min(observation.theme_id::TEXT)::UUID AS theme_id
      FROM public.tli_interest_observations AS observation
      WHERE observation.collection_run_id = run.id
        AND observation.source = 'naver_datalab'
      HAVING count(DISTINCT observation.theme_id) = 1
    ) AS single_theme
    WHERE run.source = 'naver_datalab'
      AND run.status = 'complete'
      AND (
        SELECT count(*)
        FROM jsonb_array_elements(run.request_payload->'keywordGroups') AS g
        WHERE g->>'groupName' IS DISTINCT FROM '__tli_anchor__'
      ) = 1
      AND run.collected_at <= ((p_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul')
      AND run.collected_at >= ((p_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul') - INTERVAL '7 days'
    ORDER BY single_theme.theme_id, run.completed_at DESC, run.id DESC
  )
  SELECT
    ranked_roster.theme_id,
    ranked_roster.run_id,
    ranked_roster.keyword_group_hash,
    ranked_roster.request_payload,
    ranked_roster.completed_at
  FROM ranked_roster
  ORDER BY ranked_roster.theme_id;
$$;

REVOKE EXECUTE ON FUNCTION public.tli_origin_roster(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tli_origin_roster(DATE) TO service_role;

COMMENT ON FUNCTION public.tli_origin_roster(DATE) IS
  'Returns the latest immutable complete single-theme DataLab run per theme in the seven days ending at the origin cutoff.';

COMMIT;
