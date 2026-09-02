BEGIN;

-- TLI origin universe는 cutoff 직전 usable source가 아니라 최근 7일의 immutable
-- single-theme DataLab run roster로 고정해 source 결손이 expected universe를 축소하지 못하게 한다.
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

CREATE INDEX idx_tli_collection_runs_origin_roster
  ON public.tli_collection_runs (source, status, collected_at DESC, completed_at DESC, id DESC);

CREATE TABLE public.tli_study_origin_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_origin_manifest_id UUID NOT NULL REFERENCES public.tli_study_origin_manifests(id) ON DELETE RESTRICT,
  forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT,
  origin_date DATE NOT NULL,
  rule_version TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('eligible','ineligible')),
  roster_theme_count INTEGER NOT NULL,
  expected_theme_count INTEGER NOT NULL,
  usable_theme_count INTEGER NOT NULL,
  usable_coverage NUMERIC(6,5) NOT NULL,
  unknown_theme_count INTEGER NOT NULL,
  missing_theme_count INTEGER NOT NULL,
  matured BOOLEAN NOT NULL,
  label_terminal_count INTEGER,
  label_pending_count INTEGER,
  label_source_gap_count INTEGER,
  reasons JSONB NOT NULL,
  evidence JSONB NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (study_origin_manifest_id, rule_version, payload_sha256),
  CHECK (roster_theme_count >= 0),
  CHECK (expected_theme_count >= 0),
  CHECK (usable_theme_count >= 0),
  CHECK (unknown_theme_count >= 0),
  CHECK (missing_theme_count >= 0),
  CHECK (label_terminal_count IS NULL OR label_terminal_count >= 0),
  CHECK (label_pending_count IS NULL OR label_pending_count >= 0),
  CHECK (label_source_gap_count IS NULL OR label_source_gap_count >= 0),
  CHECK (jsonb_typeof(reasons) = 'array'),
  CHECK (NOT jsonb_path_exists(reasons, '$[*] ? (@.type() != "string")')),
  CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX idx_tli_study_origin_eligibility_latest
  ON public.tli_study_origin_eligibility (
    study_origin_manifest_id,
    rule_version,
    evaluated_at DESC,
    id DESC
  );
CREATE INDEX idx_tli_study_origin_eligibility_forecast
  ON public.tli_study_origin_eligibility (forecast_origin_manifest_id);

CREATE TRIGGER guard_tli_study_origin_eligibility_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_study_origin_eligibility
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

ALTER TABLE public.tli_study_origin_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_tli_study_origin_eligibility
  ON public.tli_study_origin_eligibility
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE VIEW public.tli_study_origin_eligibility_latest
WITH (security_barrier = true, security_invoker = true)
AS
SELECT DISTINCT ON (eligibility.study_origin_manifest_id, eligibility.rule_version)
  eligibility.*
FROM public.tli_study_origin_eligibility AS eligibility
ORDER BY
  eligibility.study_origin_manifest_id,
  eligibility.rule_version,
  eligibility.evaluated_at DESC,
  eligibility.id DESC;

REVOKE ALL ON TABLE public.tli_study_origin_eligibility
  FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.tli_study_origin_eligibility
  FROM service_role;
GRANT SELECT, INSERT ON TABLE public.tli_study_origin_eligibility TO service_role;

REVOKE ALL ON TABLE public.tli_study_origin_eligibility_latest
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tli_study_origin_eligibility_latest TO service_role;

REVOKE EXECUTE ON FUNCTION public.tli_origin_roster(DATE)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tli_origin_roster(DATE) TO service_role;

COMMENT ON FUNCTION public.tli_origin_roster(DATE) IS
  'Returns the latest immutable complete single-theme DataLab run per theme in the seven days ending at the origin cutoff.';
COMMENT ON TABLE public.tli_study_origin_eligibility IS
  'Append-only origin-eligibility decisions whose payload hash excludes evaluation time for idempotent replay.';
COMMENT ON VIEW public.tli_study_origin_eligibility_latest IS
  'Latest append-only eligibility decision per study-origin manifest and rule version.';

COMMIT;
