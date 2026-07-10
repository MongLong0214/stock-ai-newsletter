BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tli_sha256_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.tli_sha256_json_string_array(p_values TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT public.tli_sha256_text(
    '[' || COALESCE(
      string_agg(to_json(value)::text, ',' ORDER BY value COLLATE "C"),
      ''
    ) || ']'
  )
  FROM unnest(p_values) AS values_to_hash(value);
$$;

CREATE OR REPLACE FUNCTION public.tli_sha256_ordered_json_string_array(p_values TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT public.tli_sha256_text(
    '[' || COALESCE(
      string_agg(to_json(value)::text, ',' ORDER BY ordinality),
      ''
    ) || ']'
  )
  FROM unnest(p_values) WITH ORDINALITY AS values_to_hash(value, ordinality);
$$;

CREATE OR REPLACE FUNCTION public.tli_json_has_duplicate_keys(p_value JSON)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_type TEXT := json_typeof(p_value);
BEGIN
  IF v_type = 'object' THEN
    IF (
      SELECT count(*) <> count(DISTINCT key)
      FROM json_each(p_value)
    ) OR EXISTS (
      SELECT 1
      FROM json_each(p_value) AS member
      WHERE public.tli_json_has_duplicate_keys(member.value)
    ) THEN
      RETURN true;
    END IF;
  ELSIF v_type = 'array' AND EXISTS (
    SELECT 1
    FROM json_array_elements(p_value) AS element(value)
    WHERE public.tli_json_has_duplicate_keys(element.value)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.tli_jsonb_object_key_count(p_value JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT count(*)::INTEGER FROM jsonb_object_keys(p_value);
$$;

CREATE OR REPLACE FUNCTION public.tli_parse_canonical_json_v1(
  p_canonical_json TEXT,
  p_expected_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
AS $$
DECLARE
  v_raw_payload JSON;
  v_payload JSONB;
BEGIN
  IF p_canonical_json IS NULL
     OR p_expected_sha256 IS NULL
     OR p_expected_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'canonical payload SHA-256 must be lowercase 64-hex'
      USING ERRCODE = '22023';
  END IF;

  IF p_canonical_json = ''
     OR left(p_canonical_json, 1) <> '{'
     OR right(p_canonical_json, 1) <> '}'
     OR position(U&'\FEFF' IN p_canonical_json) > 0
     OR p_canonical_json ~ E'[\r\n]'
  THEN
    RAISE EXCEPTION 'canonical-json-v1 payload must be one UTF-8 object with no BOM or newline'
      USING ERRCODE = '22023';
  END IF;

  IF public.tli_sha256_text(p_canonical_json) <> p_expected_sha256 THEN
    RAISE EXCEPTION 'canonical payload SHA-256 mismatch'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_raw_payload := p_canonical_json::JSON;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'canonical payload is not valid JSON'
      USING ERRCODE = '22023';
  END;

  IF public.tli_json_has_duplicate_keys(v_raw_payload) THEN
    RAISE EXCEPTION 'canonical-json-v1 payload contains duplicate object keys'
      USING ERRCODE = '22023';
  END IF;

  v_payload := v_raw_payload::JSONB;

  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION 'canonical payload root must be an object'
      USING ERRCODE = '22023';
  END IF;

  RETURN v_payload;
END;
$$;

CREATE TABLE public.tli_collection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('naver_datalab','naver_news','babl_phase')),
  contract_version TEXT NOT NULL,
  request_window_start DATE NOT NULL,
  request_window_end DATE NOT NULL,
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  request_sha256 TEXT NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 TEXT CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  keyword_group_hash TEXT CHECK (keyword_group_hash IS NULL OR keyword_group_hash ~ '^[0-9a-f]{64}$'),
  expected_universe_hash TEXT NOT NULL CHECK (expected_universe_hash ~ '^[0-9a-f]{64}$'),
  expected_keys_sha256 TEXT NOT NULL CHECK (expected_keys_sha256 ~ '^[0-9a-f]{64}$'),
  expected_row_count INTEGER NOT NULL CHECK (expected_row_count >= 0),
  observed_row_count INTEGER NOT NULL CHECK (observed_row_count >= 0),
  source_max_date DATE,
  requested_at TIMESTAMPTZ NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete','partial','failed')),
  failure_summary JSONB,
  CHECK (request_window_start <= request_window_end),
  CHECK (requested_at <= collected_at AND collected_at <= completed_at),
  CHECK ((response_payload IS NULL) = (response_sha256 IS NULL)),
  CHECK (status <> 'complete' OR expected_row_count = observed_row_count),
  CHECK (
    status <> 'complete'
    OR (
      response_payload IS NOT NULL
      AND response_sha256 IS NOT NULL
      AND source_max_date BETWEEN request_window_start AND request_window_end
    )
  ),
  CHECK (
    (status = 'complete' AND failure_summary IS NULL)
    OR (status IN ('partial','failed') AND failure_summary IS NOT NULL)
  )
);

CREATE TABLE public.tli_interest_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  trading_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source = 'naver_datalab'),
  raw_value INTEGER NOT NULL,
  normalized NUMERIC NOT NULL,
  anchor_scaled_value NUMERIC,
  keyword_epoch INTEGER NOT NULL CHECK (keyword_epoch >= 1),
  UNIQUE (collection_run_id, theme_id, trading_date, source)
);

CREATE TABLE public.tli_news_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  article_date DATE NOT NULL,
  article_count INTEGER NOT NULL CHECK (article_count >= 0),
  query_hash TEXT NOT NULL CHECK (query_hash ~ '^[0-9a-f]{64}$'),
  collected_at TIMESTAMPTZ NOT NULL,
  UNIQUE (collection_run_id, theme_id, article_date)
);

CREATE TABLE public.tli_babl_phase_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  snapshot_date DATE NOT NULL,
  phase TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  candidate_pool TEXT NOT NULL,
  comparison_spec_version TEXT NOT NULL,
  evaluation_horizon_days INTEGER NOT NULL CHECK (evaluation_horizon_days > 0),
  source_prediction_snapshot_id UUID NOT NULL REFERENCES public.prediction_snapshots_v2(id) ON DELETE RESTRICT,
  computed_at TIMESTAMPTZ NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (collection_run_id, theme_id, snapshot_date, algorithm_version, candidate_pool, comparison_spec_version, evaluation_horizon_days)
);

CREATE TABLE public.tli_attention_study_contracts (
  id UUID PRIMARY KEY,
  contract_version TEXT NOT NULL UNIQUE CHECK (contract_version = 'tli-attention-study-v1'),
  locked_at TIMESTAMPTZ NOT NULL,
  first_origin_date DATE NOT NULL,
  babl_algorithm_version TEXT NOT NULL,
  babl_comparison_spec_version TEXT NOT NULL CHECK (babl_comparison_spec_version = 'comparison-v4-spec-v1'),
  babl_evaluation_horizon_days INTEGER NOT NULL CHECK (babl_evaluation_horizon_days = 14),
  babl_candidate_pool_rule TEXT NOT NULL CHECK (babl_candidate_pool_rule = 'source_prod_run_v1'),
  babl_control_row_id UUID NOT NULL REFERENCES public.comparison_v4_control(id) ON DELETE RESTRICT,
  babl_control_sha256 TEXT NOT NULL CHECK (babl_control_sha256 ~ '^[0-9a-f]{64}$'),
  labeler_version TEXT NOT NULL CHECK (labeler_version = 'gta-v2'),
  label_contract_sha256 TEXT NOT NULL CHECK (label_contract_sha256 ~ '^[0-9a-f]{64}$'),
  feature_contract_version TEXT NOT NULL CHECK (feature_contract_version = 'tli-attention-v2-f1'),
  feature_contract_sha256 TEXT NOT NULL CHECK (feature_contract_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  git_commit_sha TEXT NOT NULL CHECK (git_commit_sha ~ '^[0-9a-f]{64}$'),
  git_blob_sha TEXT NOT NULL CHECK (git_blob_sha ~ '^[0-9a-f]{64}$'),
  repo_relative_path TEXT NOT NULL,
  verifier_version TEXT NOT NULL,
  verifier_code_sha TEXT NOT NULL CHECK (verifier_code_sha ~ '^[0-9a-f]{64}$'),
  verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (EXTRACT(ISODOW FROM first_origin_date) = 1),
  CHECK (locked_at < ((first_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul')),
  CHECK (verified_at <= locked_at),
  CHECK (repo_relative_path = 'docs/evidence/tli-v3-scientific-rebuild/studies/' || id::text || '/study-contract.json')
);

CREATE TABLE public.tli_forecast_origin_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_version TEXT NOT NULL,
  origin_date DATE NOT NULL,
  forecast_cutoff TIMESTAMPTZ NOT NULL,
  expected_theme_ids JSONB NOT NULL,
  expected_theme_count INTEGER NOT NULL CHECK (expected_theme_count > 0),
  expected_universe_sha256 TEXT NOT NULL CHECK (expected_universe_sha256 ~ '^[0-9a-f]{64}$'),
  keyword_group_manifest_sha256 TEXT NOT NULL CHECK (keyword_group_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manifest_version, origin_date),
  CHECK (jsonb_typeof(expected_theme_ids) = 'array'),
  CHECK (expected_theme_count = jsonb_array_length(expected_theme_ids)),
  CHECK (EXTRACT(ISODOW FROM origin_date) = 1),
  CHECK (forecast_cutoff = ((origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul'))
);

CREATE TABLE public.tli_forecast_origin_theme_inputs (
  forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  keyword_group_spec JSONB NOT NULL,
  keyword_group_sha256 TEXT NOT NULL CHECK (keyword_group_sha256 ~ '^[0-9a-f]{64}$'),
  forecast_interest_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  forecast_interest_response_sha256 TEXT CHECK (forecast_interest_response_sha256 IS NULL OR forecast_interest_response_sha256 ~ '^[0-9a-f]{64}$'),
  news_observation_ids JSONB NOT NULL,
  news_input_sha256 TEXT CHECK (news_input_sha256 IS NULL OR news_input_sha256 ~ '^[0-9a-f]{64}$'),
  input_status TEXT NOT NULL CHECK (input_status IN ('usable','abstain')),
  abstain_reason TEXT,
  PRIMARY KEY (forecast_origin_manifest_id, theme_id),
  CHECK (jsonb_typeof(keyword_group_spec) = 'object'),
  CHECK (jsonb_typeof(news_observation_ids) = 'array'),
  CHECK ((input_status = 'usable'
      AND forecast_interest_run_id IS NOT NULL
      AND forecast_interest_response_sha256 IS NOT NULL
      AND jsonb_array_length(news_observation_ids) = 14
      AND news_input_sha256 IS NOT NULL
      AND abstain_reason IS NULL)
    OR
    (input_status = 'abstain'
      AND forecast_interest_run_id IS NULL
      AND forecast_interest_response_sha256 IS NULL
      AND news_observation_ids = '[]'::JSONB
      AND news_input_sha256 IS NULL
      AND abstain_reason IS NOT NULL)
  )
);

CREATE TABLE public.tli_study_origin_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_contract_id UUID NOT NULL REFERENCES public.tli_attention_study_contracts(id) ON DELETE RESTRICT,
  forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (study_contract_id, forecast_origin_manifest_id)
);

CREATE TABLE public.tli_study_origin_theme_inputs (
  study_origin_manifest_id UUID NOT NULL REFERENCES public.tli_study_origin_manifests(id) ON DELETE RESTRICT,
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  babl_observation_id UUID REFERENCES public.tli_babl_phase_observations(id) ON DELETE RESTRICT,
  babl_input_sha256 TEXT CHECK (babl_input_sha256 IS NULL OR babl_input_sha256 ~ '^[0-9a-f]{64}$'),
  babl_candidate_pool TEXT,
  babl_missing_reason TEXT CHECK (babl_missing_reason IN ('no_matching_observation','multiple_matching_observations','source_run_not_complete','source_after_cutoff','source_pool_mismatch')),
  PRIMARY KEY (study_origin_manifest_id, theme_id),
  CHECK (
    (babl_observation_id IS NOT NULL AND babl_input_sha256 IS NOT NULL AND babl_candidate_pool IS NOT NULL AND babl_missing_reason IS NULL)
    OR
    (babl_observation_id IS NULL AND babl_input_sha256 IS NULL AND babl_candidate_pool IS NULL AND babl_missing_reason IS NOT NULL)
  )
);

CREATE INDEX idx_tli_interest_observations_theme_date
  ON public.tli_interest_observations (theme_id, trading_date DESC, collection_run_id);
CREATE INDEX idx_tli_collection_runs_source_latest
  ON public.tli_collection_runs (source, status, keyword_group_hash, source_max_date DESC, completed_at DESC, id DESC);
CREATE INDEX idx_tli_news_observations_theme_date
  ON public.tli_news_observations (theme_id, article_date, query_hash, collected_at DESC, id DESC);
CREATE INDEX idx_tli_babl_phase_observations_theme_date
  ON public.tli_babl_phase_observations (theme_id, snapshot_date DESC, algorithm_version, comparison_spec_version, evaluation_horizon_days, candidate_pool);
CREATE INDEX idx_tli_babl_phase_observations_source_snapshot
  ON public.tli_babl_phase_observations (source_prediction_snapshot_id);
CREATE INDEX idx_tli_attention_study_contracts_control
  ON public.tli_attention_study_contracts (babl_control_row_id);
CREATE INDEX idx_tli_forecast_origin_manifests_origin
  ON public.tli_forecast_origin_manifests (origin_date DESC);
CREATE INDEX idx_tli_forecast_origin_theme_inputs_theme
  ON public.tli_forecast_origin_theme_inputs (theme_id, forecast_origin_manifest_id);
CREATE INDEX idx_tli_forecast_origin_theme_inputs_interest_run
  ON public.tli_forecast_origin_theme_inputs (forecast_interest_run_id)
  WHERE forecast_interest_run_id IS NOT NULL;
CREATE INDEX idx_tli_study_origin_manifests_forecast
  ON public.tli_study_origin_manifests (forecast_origin_manifest_id);
CREATE INDEX idx_tli_study_origin_theme_inputs_theme
  ON public.tli_study_origin_theme_inputs (theme_id, study_origin_manifest_id);
CREATE INDEX idx_tli_study_origin_theme_inputs_babl
  ON public.tli_study_origin_theme_inputs (babl_observation_id)
  WHERE babl_observation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reject_tli_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE, DELETE, and TRUNCATE are forbidden', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER guard_tli_collection_runs_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_collection_runs
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_interest_observations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_interest_observations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_news_observations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_news_observations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_babl_phase_observations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_babl_phase_observations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_attention_study_contracts_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_attention_study_contracts
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_forecast_origin_manifests_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_forecast_origin_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_forecast_origin_theme_inputs_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_forecast_origin_theme_inputs
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_study_origin_manifests_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_study_origin_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_study_origin_theme_inputs_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_study_origin_theme_inputs
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

CREATE OR REPLACE FUNCTION public.validate_tli_collection_run_observations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_run_id UUID;
  v_run public.tli_collection_runs%ROWTYPE;
  v_actual_count INTEGER;
  v_actual_keys_sha256 TEXT;
  v_expected_source TEXT;
BEGIN
  v_run_id := CASE
    WHEN TG_TABLE_NAME = 'tli_collection_runs' THEN NEW.id
    ELSE NEW.collection_run_id
  END;

  SELECT * INTO v_run
  FROM public.tli_collection_runs
  WHERE id = v_run_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_expected_source := CASE TG_TABLE_NAME
    WHEN 'tli_interest_observations' THEN 'naver_datalab'
    WHEN 'tli_news_observations' THEN 'naver_news'
    WHEN 'tli_babl_phase_observations' THEN 'babl_phase'
    ELSE v_run.source
  END;

  IF v_run.source <> v_expected_source THEN
    RAISE EXCEPTION 'observation table does not match collection run source'
      USING ERRCODE = '22023';
  END IF;

  CASE v_run.source
    WHEN 'naver_datalab' THEN
      SELECT count(*)::INTEGER,
             public.tli_sha256_json_string_array(
               COALESCE(array_agg(theme_id::text || '|' || to_char(trading_date, 'YYYY-MM-DD') || '|' || source), ARRAY[]::TEXT[])
             )
      INTO v_actual_count, v_actual_keys_sha256
      FROM public.tli_interest_observations
      WHERE collection_run_id = v_run.id;
    WHEN 'naver_news' THEN
      SELECT count(*)::INTEGER,
             public.tli_sha256_json_string_array(
               COALESCE(array_agg(theme_id::text || '|' || to_char(article_date, 'YYYY-MM-DD')), ARRAY[]::TEXT[])
             )
      INTO v_actual_count, v_actual_keys_sha256
      FROM public.tli_news_observations
      WHERE collection_run_id = v_run.id;
    WHEN 'babl_phase' THEN
      SELECT count(*)::INTEGER,
             public.tli_sha256_json_string_array(
               COALESCE(array_agg(
                 theme_id::text || '|' || to_char(snapshot_date, 'YYYY-MM-DD') || '|' || algorithm_version || '|' ||
                 candidate_pool || '|' || comparison_spec_version || '|' || evaluation_horizon_days::text
               ), ARRAY[]::TEXT[])
             )
      INTO v_actual_count, v_actual_keys_sha256
      FROM public.tli_babl_phase_observations
      WHERE collection_run_id = v_run.id;

      IF EXISTS (
        SELECT 1
        FROM public.tli_babl_phase_observations AS observation
        LEFT JOIN public.prediction_snapshots_v2 AS source_snapshot
          ON source_snapshot.id = observation.source_prediction_snapshot_id
        LEFT JOIN public.theme_comparison_runs_v2 AS source_comparison_run
          ON source_comparison_run.id = source_snapshot.comparison_run_id
        WHERE observation.collection_run_id = v_run.id
          AND (
            source_snapshot.id IS NULL
            OR source_snapshot.theme_id IS DISTINCT FROM observation.theme_id
            OR source_snapshot.snapshot_date IS DISTINCT FROM observation.snapshot_date
            OR source_snapshot.phase IS DISTINCT FROM observation.phase
            OR source_snapshot.algorithm_version IS DISTINCT FROM observation.algorithm_version
            OR source_snapshot.comparison_spec_version IS DISTINCT FROM observation.comparison_spec_version
            OR source_snapshot.evaluation_horizon_days IS DISTINCT FROM observation.evaluation_horizon_days
            OR source_snapshot.created_at IS DISTINCT FROM observation.computed_at
            OR source_snapshot.run_type IS DISTINCT FROM 'prod'
            OR source_comparison_run.id IS NULL
            OR source_comparison_run.current_theme_id IS DISTINCT FROM observation.theme_id
            OR source_comparison_run.run_date IS DISTINCT FROM observation.snapshot_date
            OR source_comparison_run.algorithm_version IS DISTINCT FROM observation.algorithm_version
            OR source_comparison_run.comparison_spec_version IS DISTINCT FROM observation.comparison_spec_version
            OR source_comparison_run.run_type IS DISTINCT FROM 'prod'
          )
      ) THEN
        RAISE EXCEPTION 'B-Abl observation identity does not match its exact prod source snapshot and run'
          USING ERRCODE = '22023';
      END IF;
  END CASE;

  IF v_actual_count <> v_run.observed_row_count THEN
    RAISE EXCEPTION 'collection run observed_row_count does not match inserted observations'
      USING ERRCODE = '55000';
  END IF;

  IF v_run.status = 'complete' THEN
    IF v_run.expected_row_count <> v_run.observed_row_count
       OR v_run.expected_keys_sha256 <> v_actual_keys_sha256
    THEN
      RAISE EXCEPTION 'complete collection run does not contain the exact expected key set'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER validate_tli_collection_run_after_insert
  AFTER INSERT ON public.tli_collection_runs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_collection_run_observations();
CREATE CONSTRAINT TRIGGER validate_tli_interest_observation_after_insert
  AFTER INSERT ON public.tli_interest_observations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_collection_run_observations();
CREATE CONSTRAINT TRIGGER validate_tli_news_observation_after_insert
  AFTER INSERT ON public.tli_news_observations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_collection_run_observations();
CREATE CONSTRAINT TRIGGER validate_tli_babl_observation_after_insert
  AFTER INSERT ON public.tli_babl_phase_observations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_collection_run_observations();

CREATE OR REPLACE FUNCTION public.lock_tli_attention_study_contract(
  p_study_id UUID,
  p_contract_canonical_json TEXT,
  p_contract_payload_sha256 TEXT,
  p_control_canonical_json TEXT,
  p_git_commit_sha TEXT,
  p_git_blob_sha TEXT,
  p_repo_relative_path TEXT,
  p_verifier_version TEXT,
  p_verifier_code_sha TEXT,
  p_verified_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_control_payload JSONB;
  v_control RECORD;
  v_control_json JSONB;
  v_control_count INTEGER;
  v_locked_at TIMESTAMPTZ;
  v_first_origin_date DATE;
  v_cutoff TIMESTAMPTZ;
  v_control_sha256 TEXT;
  v_label_contract_sha256 TEXT;
  v_feature_contract_sha256 TEXT;
  v_expected_path TEXT;
  v_allowed_keys CONSTANT TEXT[] := ARRAY[
    'id',
    'contract_version',
    'first_origin_date',
    'babl_algorithm_version',
    'babl_comparison_spec_version',
    'babl_evaluation_horizon_days',
    'babl_candidate_pool_rule',
    'babl_control_row_id',
    'babl_control_sha256',
    'labeler_version',
    'label_contract_sha256',
    'feature_contract_version',
    'feature_contract_sha256'
  ];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-attention-study-lock-v1', 0));

  v_payload := public.tli_parse_canonical_json_v1(
    p_contract_canonical_json,
    p_contract_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> cardinality(v_allowed_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE NOT (payload_key.key = ANY(v_allowed_keys))
     )
     OR jsonb_typeof(v_payload -> 'id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'contract_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'first_origin_date') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'babl_algorithm_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'babl_comparison_spec_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'babl_evaluation_horizon_days') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'babl_candidate_pool_rule') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'babl_control_row_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'babl_control_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'labeler_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'label_contract_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'feature_contract_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'feature_contract_sha256') IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION 'study contract payload has unknown or missing fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_first_origin_date := (v_payload ->> 'first_origin_date')::DATE;
    v_control_sha256 := v_payload ->> 'babl_control_sha256';
    v_label_contract_sha256 := v_payload ->> 'label_contract_sha256';
    v_feature_contract_sha256 := v_payload ->> 'feature_contract_sha256';
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'study contract payload contains invalid typed values'
      USING ERRCODE = '22023';
  END;

  IF v_payload ->> 'id' IS DISTINCT FROM p_study_id::text
     OR v_payload ->> 'contract_version' IS DISTINCT FROM 'tli-attention-study-v1'
     OR v_payload ->> 'first_origin_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_payload ->> 'first_origin_date' IS DISTINCT FROM to_char(v_first_origin_date, 'YYYY-MM-DD')
     OR v_payload ->> 'babl_comparison_spec_version' IS DISTINCT FROM 'comparison-v4-spec-v1'
     OR v_payload ->> 'babl_evaluation_horizon_days' IS DISTINCT FROM '14'
     OR v_payload ->> 'babl_candidate_pool_rule' IS DISTINCT FROM 'source_prod_run_v1'
     OR v_payload ->> 'labeler_version' IS DISTINCT FROM 'gta-v2'
     OR v_payload ->> 'feature_contract_version' IS DISTINCT FROM 'tli-attention-v2-f1'
     OR v_control_sha256 IS NULL
     OR v_control_sha256 !~ '^[0-9a-f]{64}$'
     OR v_label_contract_sha256 IS NULL
     OR v_label_contract_sha256 !~ '^[0-9a-f]{64}$'
     OR v_feature_contract_sha256 IS NULL
     OR v_feature_contract_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'study contract payload violates the code-pinned contract'
      USING ERRCODE = '22023';
  END IF;

  IF v_first_origin_date IS NULL
     OR EXTRACT(ISODOW FROM v_first_origin_date) IS DISTINCT FROM 1
  THEN
    RAISE EXCEPTION 'first_origin_date must be an ISO Monday'
      USING ERRCODE = '22023';
  END IF;

  v_cutoff := ((v_first_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul');

  v_expected_path := 'docs/evidence/tli-v3-scientific-rebuild/studies/' ||
    p_study_id::text || '/study-contract.json';
  IF p_repo_relative_path IS DISTINCT FROM v_expected_path
     OR p_git_commit_sha IS NULL
     OR p_git_commit_sha !~ '^[0-9a-f]{64}$'
     OR p_git_blob_sha IS NULL
     OR p_git_blob_sha !~ '^[0-9a-f]{64}$'
     OR p_verifier_code_sha IS NULL
     OR p_verifier_code_sha !~ '^[0-9a-f]{64}$'
     OR NULLIF(p_verifier_version, '') IS NULL
     OR p_verified_at IS NULL
  THEN
    RAISE EXCEPTION 'trusted Git attestation is invalid or does not match the exact study path'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::INTEGER INTO v_control_count
  FROM public.comparison_v4_control
  WHERE serving_enabled = true;

  IF v_control_count <> 1 THEN
    RAISE EXCEPTION 'study lock requires exactly one enabled comparison_v4_control row'
      USING ERRCODE = '21000';
  END IF;

  SELECT * INTO v_control
  FROM public.comparison_v4_control
  WHERE serving_enabled = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enabled comparison_v4_control changed while the study lock was waiting'
      USING ERRCODE = '21000';
  END IF;

  v_locked_at := clock_timestamp();
  IF v_locked_at >= v_cutoff THEN
    RAISE EXCEPTION 'study contract must be locked before first origin cutoff'
      USING ERRCODE = '55000';
  END IF;
  IF p_verified_at > v_locked_at THEN
    RAISE EXCEPTION 'trusted Git attestation cannot be later than the server lock time'
      USING ERRCODE = '22023';
  END IF;

  v_control_json := jsonb_build_object(
    'id', v_control.id::text,
    'production_version', v_control.production_version,
    'serving_enabled', v_control.serving_enabled,
    'promoted_by', v_control.promoted_by,
    'promoted_at', to_char(v_control.promoted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'created_at', to_char(v_control.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'source_surface', v_control.source_surface,
    'calibration_version', v_control.calibration_version,
    'weight_version', v_control.weight_version,
    'drift_version', v_control.drift_version,
    'promotion_gate_status', v_control.promotion_gate_status,
    'promotion_gate_summary', v_control.promotion_gate_summary,
    'promotion_gate_failures', v_control.promotion_gate_failures,
    'previous_stable_version', v_control.previous_stable_version,
    'rollback_reason', v_control.rollback_reason,
    'rolled_back_at', CASE
      WHEN v_control.rolled_back_at IS NULL THEN NULL
      ELSE to_jsonb(to_char(v_control.rolled_back_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    END,
    'auto_hold_enabled', v_control.auto_hold_enabled,
    'hold_state', v_control.hold_state,
    'hold_reason', v_control.hold_reason,
    'hold_report_date', CASE
      WHEN v_control.hold_report_date IS NULL THEN NULL
      ELSE to_jsonb(to_char(v_control.hold_report_date, 'YYYY-MM-DD'))
    END,
    'updated_at', to_char(v_control.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'decision_trace', v_control.decision_trace
  );

  v_control_payload := public.tli_parse_canonical_json_v1(
    p_control_canonical_json,
    v_control_sha256
  );
  IF v_control_payload IS DISTINCT FROM v_control_json
     OR v_payload ->> 'babl_control_row_id' IS DISTINCT FROM v_control.id::text
     OR v_payload ->> 'babl_algorithm_version' IS DISTINCT FROM v_control.production_version
  THEN
    RAISE EXCEPTION 'study contract does not match the exact enabled control row'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tli_attention_study_contracts
    WHERE id = p_study_id OR contract_version = 'tli-attention-study-v1'
  ) OR EXISTS (
    SELECT 1 FROM public.tli_study_origin_manifests
    WHERE study_contract_id = p_study_id
  ) THEN
    RAISE EXCEPTION 'study contract or study origins already exist'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tli_attention_study_contracts (
    id,
    contract_version,
    locked_at,
    first_origin_date,
    babl_algorithm_version,
    babl_comparison_spec_version,
    babl_evaluation_horizon_days,
    babl_candidate_pool_rule,
    babl_control_row_id,
    babl_control_sha256,
    labeler_version,
    label_contract_sha256,
    feature_contract_version,
    feature_contract_sha256,
    payload_sha256,
    git_commit_sha,
    git_blob_sha,
    repo_relative_path,
    verifier_version,
    verifier_code_sha,
    verified_at,
    created_at
  ) VALUES (
    p_study_id,
    'tli-attention-study-v1',
    v_locked_at,
    v_first_origin_date,
    v_control.production_version,
    'comparison-v4-spec-v1',
    14,
    'source_prod_run_v1',
    v_control.id,
    v_control_sha256,
    'gta-v2',
    v_label_contract_sha256,
    'tli-attention-v2-f1',
    v_feature_contract_sha256,
    p_contract_payload_sha256,
    p_git_commit_sha,
    p_git_blob_sha,
    p_repo_relative_path,
    p_verifier_version,
    p_verifier_code_sha,
    p_verified_at,
    v_locked_at
  );

  RETURN p_study_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tli_forecast_origin_manifest(
  p_manifest_canonical_json TEXT,
  p_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_manifest_id UUID := gen_random_uuid();
  v_existing_id UUID;
  v_existing_sha256 TEXT;
  v_manifest_version TEXT;
  v_origin_date DATE;
  v_cutoff TIMESTAMPTZ;
  v_expected_theme_count INTEGER;
  v_expected_theme_ids TEXT[];
  v_sorted_theme_ids TEXT[];
  v_child_theme_ids TEXT[];
  v_expected_universe_sha256 TEXT;
  v_keyword_manifest_sha256 TEXT;
  v_keyword_manifest_items TEXT[] := ARRAY[]::TEXT[];
  v_theme_input JSONB;
  v_theme_id_text TEXT;
  v_theme_id UUID;
  v_keyword_group_payload JSONB;
  v_keyword_group_sha256 TEXT;
  v_input_status TEXT;
  v_interest_run_id UUID;
  v_interest_response_sha256 TEXT;
  v_interest_run RECORD;
  v_interest_count INTEGER;
  v_interest_dates DATE[];
  v_required_interest_dates DATE[];
  v_previous_trading_date DATE;
  v_latest_interest_run_id UUID;
  v_required_news_dates DATE[];
  v_news_ids_text TEXT[];
  v_news_ids UUID[];
  v_expected_news_ids UUID[];
  v_expected_news_count INTEGER;
  v_news_input_sha256 TEXT;
  v_allowed_parent_keys CONSTANT TEXT[] := ARRAY[
    'manifest_version',
    'origin_date',
    'forecast_cutoff',
    'expected_theme_ids',
    'expected_theme_count',
    'expected_universe_sha256',
    'keyword_group_manifest_sha256',
    'theme_inputs'
  ];
  v_allowed_child_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'keyword_group_spec',
    'keyword_group_canonical_json',
    'keyword_group_sha256',
    'forecast_interest_run_id',
    'forecast_interest_response_sha256',
    'news_observation_ids',
    'news_input_sha256',
    'input_status',
    'abstain_reason'
  ];
BEGIN
  v_payload := public.tli_parse_canonical_json_v1(
    p_manifest_canonical_json,
    p_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> cardinality(v_allowed_parent_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE NOT (payload_key.key = ANY(v_allowed_parent_keys))
     )
     OR jsonb_typeof(v_payload -> 'manifest_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'origin_date') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'forecast_cutoff') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'expected_theme_ids') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_payload -> 'expected_theme_count') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_payload -> 'expected_universe_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'keyword_group_manifest_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'theme_inputs') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'forecast manifest payload has unknown, missing, or malformed fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_manifest_version := v_payload ->> 'manifest_version';
    v_origin_date := (v_payload ->> 'origin_date')::DATE;
    v_expected_theme_count := (v_payload ->> 'expected_theme_count')::INTEGER;
    v_expected_universe_sha256 := v_payload ->> 'expected_universe_sha256';
    v_keyword_manifest_sha256 := v_payload ->> 'keyword_group_manifest_sha256';
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'forecast manifest payload contains invalid typed values'
      USING ERRCODE = '22023';
  END;

  IF NULLIF(v_manifest_version, '') IS NULL
     OR v_origin_date IS NULL
     OR v_payload ->> 'origin_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_payload ->> 'origin_date' IS DISTINCT FROM to_char(v_origin_date, 'YYYY-MM-DD')
     OR EXTRACT(ISODOW FROM v_origin_date) IS DISTINCT FROM 1
     OR v_expected_theme_count IS NULL
     OR v_expected_theme_count <= 0
     OR v_expected_universe_sha256 IS NULL
     OR v_expected_universe_sha256 !~ '^[0-9a-f]{64}$'
     OR v_keyword_manifest_sha256 IS NULL
     OR v_keyword_manifest_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'forecast manifest parent contract is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_cutoff := ((v_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul');
  IF v_payload ->> 'forecast_cutoff' IS DISTINCT FROM
     to_char(v_cutoff AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  THEN
    RAISE EXCEPTION 'forecast_cutoff must equal origin_date 18:00:00 Asia/Seoul'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI'
      AND trade_date = v_origin_date
  ) THEN
    RAISE EXCEPTION 'forecast origin Monday is not an observed Korean trading date'
      USING ERRCODE = '55000';
  END IF;

  SELECT max(trade_date)
  INTO v_previous_trading_date
  FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI'
    AND trade_date < v_origin_date;

  SELECT array_agg(trade_date ORDER BY trade_date)
  INTO v_required_news_dates
  FROM (
    SELECT trade_date
    FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI'
      AND trade_date <= v_origin_date
    ORDER BY trade_date DESC
    LIMIT 14
  ) AS latest_news_trading_dates;

  IF v_previous_trading_date IS NULL
     OR cardinality(v_required_news_dates) IS DISTINCT FROM 14
  THEN
    RAISE EXCEPTION 'forecast origin lacks the required Korean trading-date history'
      USING ERRCODE = '55000';
  END IF;

  SELECT array_agg(theme_id ORDER BY ordinality)
  INTO v_expected_theme_ids
  FROM jsonb_array_elements_text(v_payload -> 'expected_theme_ids')
    WITH ORDINALITY AS expected(theme_id, ordinality);

  IF cardinality(v_expected_theme_ids) IS DISTINCT FROM v_expected_theme_count
     OR EXISTS (
       SELECT 1 FROM unnest(v_expected_theme_ids) AS expected(theme_id)
       WHERE expected.theme_id IS NULL
          OR expected.theme_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     )
  THEN
    RAISE EXCEPTION 'expected_theme_ids must contain the declared number of lowercase UUIDs'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(theme_id ORDER BY theme_id COLLATE "C")
  INTO v_sorted_theme_ids
  FROM (
    SELECT DISTINCT theme_id
    FROM unnest(v_expected_theme_ids) AS expected(theme_id)
  ) AS unique_themes;

  IF v_expected_theme_ids IS DISTINCT FROM v_sorted_theme_ids
     OR cardinality(v_sorted_theme_ids) IS DISTINCT FROM v_expected_theme_count
     OR public.tli_sha256_json_string_array(v_expected_theme_ids) IS DISTINCT FROM v_expected_universe_sha256
  THEN
    RAISE EXCEPTION 'expected_theme_ids must be sorted, unique, and match expected_universe_sha256'
      USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(theme_input ->> 'theme_id' ORDER BY ordinality)
  INTO v_child_theme_ids
  FROM jsonb_array_elements(v_payload -> 'theme_inputs')
    WITH ORDINALITY AS children(theme_input, ordinality);

  IF v_child_theme_ids IS DISTINCT FROM v_expected_theme_ids THEN
    RAISE EXCEPTION 'forecast child theme keys must exactly equal the parent universe'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('tli-forecast-origin-v1|' || v_manifest_version || '|' || to_char(v_origin_date, 'YYYY-MM-DD'), 0)
  );

  SELECT id, payload_sha256
  INTO v_existing_id, v_existing_sha256
  FROM public.tli_forecast_origin_manifests
  WHERE manifest_version = v_manifest_version
    AND origin_date = v_origin_date;

  IF FOUND THEN
    IF v_existing_sha256 IS NOT DISTINCT FROM p_payload_sha256 THEN
      RETURN v_existing_id;
    END IF;
    RAISE EXCEPTION 'same version/date has a different payload'
      USING ERRCODE = '23505';
  END IF;

  FOR v_theme_input IN
    SELECT theme_input
    FROM jsonb_array_elements(v_payload -> 'theme_inputs') AS children(theme_input)
  LOOP
    IF jsonb_typeof(v_theme_input) IS DISTINCT FROM 'object'
       OR public.tli_jsonb_object_key_count(v_theme_input) <> cardinality(v_allowed_child_keys)
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(v_theme_input) AS child_key(key)
         WHERE NOT (child_key.key = ANY(v_allowed_child_keys))
       )
       OR jsonb_typeof(v_theme_input -> 'keyword_group_spec') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_theme_input -> 'keyword_group_canonical_json') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_theme_input -> 'theme_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_theme_input -> 'keyword_group_sha256') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_theme_input -> 'news_observation_ids') IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_theme_input -> 'input_status') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_theme_input -> 'forecast_interest_run_id') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'forecast_interest_response_sha256') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'news_input_sha256') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'abstain_reason') NOT IN ('string','null')
    THEN
      RAISE EXCEPTION 'forecast theme input has unknown, missing, or malformed fields'
        USING ERRCODE = '22023';
    END IF;

    v_theme_id_text := v_theme_input ->> 'theme_id';
    v_keyword_group_sha256 := v_theme_input ->> 'keyword_group_sha256';
    v_input_status := v_theme_input ->> 'input_status';

    IF v_theme_id_text IS NULL
       OR v_theme_id_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR v_keyword_group_sha256 IS NULL
       OR v_keyword_group_sha256 !~ '^[0-9a-f]{64}$'
       OR v_input_status IS NULL
       OR v_input_status NOT IN ('usable','abstain')
    THEN
      RAISE EXCEPTION 'forecast theme input identity or status is invalid'
        USING ERRCODE = '22023';
    END IF;

    v_theme_id := v_theme_id_text::UUID;
    v_keyword_group_payload := public.tli_parse_canonical_json_v1(
      v_theme_input ->> 'keyword_group_canonical_json',
      v_keyword_group_sha256
    );
    IF v_keyword_group_payload IS DISTINCT FROM v_theme_input -> 'keyword_group_spec' THEN
      RAISE EXCEPTION 'keyword_group_sha256 does not bind the exact keyword_group_spec canonical bytes'
        USING ERRCODE = '22023';
    END IF;

    v_keyword_manifest_items := array_append(
      v_keyword_manifest_items,
      v_theme_id_text || '|' || v_keyword_group_sha256
    );

    IF v_input_status = 'usable' THEN
      BEGIN
        v_interest_run_id := (v_theme_input ->> 'forecast_interest_run_id')::UUID;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'usable input requires a valid forecast_interest_run_id'
          USING ERRCODE = '22023';
      END;
      IF v_interest_run_id IS NULL THEN
        RAISE EXCEPTION 'usable input requires a valid forecast_interest_run_id'
          USING ERRCODE = '22023';
      END IF;
      IF v_theme_input ->> 'forecast_interest_run_id' IS DISTINCT FROM v_interest_run_id::text THEN
        RAISE EXCEPTION 'forecast_interest_run_id must be a lowercase canonical UUID'
          USING ERRCODE = '22023';
      END IF;
      v_interest_response_sha256 := v_theme_input ->> 'forecast_interest_response_sha256';
      v_news_input_sha256 := v_theme_input ->> 'news_input_sha256';

      IF v_interest_response_sha256 IS NULL
         OR v_interest_response_sha256 !~ '^[0-9a-f]{64}$'
         OR v_news_input_sha256 IS NULL
         OR v_news_input_sha256 !~ '^[0-9a-f]{64}$'
         OR v_theme_input -> 'abstain_reason' IS DISTINCT FROM 'null'::JSONB
      THEN
        RAISE EXCEPTION 'usable input provenance fields are incomplete'
          USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_interest_run
      FROM public.tli_collection_runs
      WHERE id = v_interest_run_id
        AND source = 'naver_datalab'
        AND status = 'complete'
        AND response_sha256 = v_interest_response_sha256
        AND keyword_group_hash = v_keyword_group_sha256
        AND collected_at <= v_cutoff
        AND completed_at <= v_cutoff
        AND source_max_date >= v_previous_trading_date
        AND source_max_date <= v_origin_date;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'usable input interest run is wrong, partial, or after cutoff'
          USING ERRCODE = '55000';
      END IF;

      SELECT count(*)::INTEGER,
             array_agg(trading_date ORDER BY trading_date)
      INTO v_interest_count, v_interest_dates
      FROM public.tli_interest_observations
      WHERE collection_run_id = v_interest_run_id
        AND theme_id = v_theme_id
        AND source = 'naver_datalab';

      SELECT array_agg(trade_date ORDER BY trade_date)
      INTO v_required_interest_dates
      FROM (
        SELECT trade_date
        FROM public.stock_daily_prices
        WHERE symbol = 'KOSPI'
          AND trade_date <= v_interest_run.source_max_date
        ORDER BY trade_date DESC
        LIMIT 20
      ) AS latest_trading_dates;

      IF v_interest_count IS DISTINCT FROM 20
         OR cardinality(v_required_interest_dates) IS DISTINCT FROM 20
         OR v_interest_dates IS DISTINCT FROM v_required_interest_dates
      THEN
        RAISE EXCEPTION 'usable input requires the exact latest 20 Korean trading-date slots from one run'
          USING ERRCODE = '55000';
      END IF;

      SELECT r.id INTO v_latest_interest_run_id
      FROM public.tli_collection_runs AS r
      CROSS JOIN LATERAL (
        SELECT array_agg(trade_date ORDER BY trade_date) AS dates
        FROM (
          SELECT trade_date
          FROM public.stock_daily_prices
          WHERE symbol = 'KOSPI'
            AND trade_date <= r.source_max_date
          ORDER BY trade_date DESC
          LIMIT 20
        ) AS latest_trading_dates
      ) AS required_dates
      CROSS JOIN LATERAL (
        SELECT array_agg(interest.trading_date ORDER BY interest.trading_date) AS dates
        FROM public.tli_interest_observations AS interest
        WHERE interest.collection_run_id = r.id
          AND interest.theme_id = v_theme_id
          AND interest.source = 'naver_datalab'
      ) AS observed_dates
      WHERE r.source = 'naver_datalab'
        AND r.status = 'complete'
        AND r.keyword_group_hash = v_keyword_group_sha256
        AND r.collected_at <= v_cutoff
        AND r.completed_at <= v_cutoff
        AND r.source_max_date >= v_previous_trading_date
        AND r.source_max_date <= v_origin_date
        AND cardinality(required_dates.dates) = 20
        AND observed_dates.dates = required_dates.dates
      ORDER BY r.source_max_date DESC, r.completed_at DESC, r.id DESC
      LIMIT 1;

      IF v_latest_interest_run_id IS DISTINCT FROM v_interest_run_id THEN
        RAISE EXCEPTION 'forecast_interest_run_id is not the latest eligible complete single run'
          USING ERRCODE = '55000';
      END IF;

      SELECT array_agg(news_id ORDER BY article_date), count(news_id)::INTEGER
      INTO v_expected_news_ids, v_expected_news_count
      FROM (
        SELECT required.article_date,
          (
            SELECT news.id
            FROM public.tli_news_observations AS news
            JOIN public.tli_collection_runs AS news_run
              ON news_run.id = news.collection_run_id
            WHERE news.theme_id = v_theme_id
              AND news.article_date = required.article_date
              AND news.query_hash = v_keyword_group_sha256
              AND news.collected_at <= v_cutoff
              AND news_run.source = 'naver_news'
              AND news_run.status = 'complete'
              AND news_run.collected_at <= v_cutoff
              AND news_run.completed_at <= v_cutoff
            ORDER BY news.collected_at DESC, news.id DESC
            LIMIT 1
          ) AS news_id
        FROM (
          SELECT article_date
          FROM unnest(v_required_news_dates) AS required_dates(article_date)
        ) AS required
      ) AS latest_news;

      IF v_expected_news_count IS DISTINCT FROM 14 THEN
        RAISE EXCEPTION 'usable input requires an explicit latest news row for every one of 14 Korean trading dates'
          USING ERRCODE = '55000';
      END IF;

      SELECT array_agg(news_id::UUID ORDER BY ordinality),
             array_agg(news_id ORDER BY ordinality)
      INTO v_news_ids, v_news_ids_text
      FROM jsonb_array_elements_text(v_theme_input -> 'news_observation_ids')
        WITH ORDINALITY AS supplied(news_id, ordinality)
      WHERE news_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      IF cardinality(v_news_ids) IS DISTINCT FROM 14
         OR v_news_ids IS DISTINCT FROM v_expected_news_ids
         OR public.tli_sha256_ordered_json_string_array(v_news_ids_text) IS DISTINCT FROM v_news_input_sha256
      THEN
        RAISE EXCEPTION 'news_observation_ids are incomplete, unordered, wrong-date, or hash-mismatched'
          USING ERRCODE = '55000';
      END IF;
    ELSE
      IF v_theme_input -> 'forecast_interest_run_id' IS DISTINCT FROM 'null'::JSONB
         OR v_theme_input -> 'forecast_interest_response_sha256' IS DISTINCT FROM 'null'::JSONB
         OR v_theme_input -> 'news_observation_ids' IS DISTINCT FROM '[]'::JSONB
         OR v_theme_input -> 'news_input_sha256' IS DISTINCT FROM 'null'::JSONB
         OR NULLIF(v_theme_input ->> 'abstain_reason', '') IS NULL
      THEN
        RAISE EXCEPTION 'abstain input must contain only an explicit non-empty reason'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF public.tli_sha256_json_string_array(v_keyword_manifest_items) IS DISTINCT FROM
     v_keyword_manifest_sha256
  THEN
    RAISE EXCEPTION 'keyword_group_manifest_sha256 does not match all theme inputs'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tli_forecast_origin_manifests (
    id,
    manifest_version,
    origin_date,
    forecast_cutoff,
    expected_theme_ids,
    expected_theme_count,
    expected_universe_sha256,
    keyword_group_manifest_sha256,
    payload_sha256,
    created_at
  ) VALUES (
    v_manifest_id,
    v_manifest_version,
    v_origin_date,
    v_cutoff,
    v_payload -> 'expected_theme_ids',
    v_expected_theme_count,
    v_expected_universe_sha256,
    v_keyword_manifest_sha256,
    p_payload_sha256,
    clock_timestamp()
  );

  INSERT INTO public.tli_forecast_origin_theme_inputs (
    forecast_origin_manifest_id,
    theme_id,
    keyword_group_spec,
    keyword_group_sha256,
    forecast_interest_run_id,
    forecast_interest_response_sha256,
    news_observation_ids,
    news_input_sha256,
    input_status,
    abstain_reason
  )
  SELECT
    v_manifest_id,
    (theme_input ->> 'theme_id')::UUID,
    theme_input -> 'keyword_group_spec',
    theme_input ->> 'keyword_group_sha256',
    NULLIF(theme_input ->> 'forecast_interest_run_id', '')::UUID,
    theme_input ->> 'forecast_interest_response_sha256',
    theme_input -> 'news_observation_ids',
    theme_input ->> 'news_input_sha256',
    theme_input ->> 'input_status',
    theme_input ->> 'abstain_reason'
  FROM jsonb_array_elements(v_payload -> 'theme_inputs') AS children(theme_input);

  RETURN v_manifest_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_tli_study_origin(
  p_manifest_canonical_json TEXT,
  p_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_manifest_id UUID := gen_random_uuid();
  v_study_contract_id UUID;
  v_forecast_manifest_id UUID;
  v_study public.tli_attention_study_contracts%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
  v_expected_theme_ids TEXT[];
  v_child_theme_ids TEXT[];
  v_forecast_child_count INTEGER;
  v_theme_input JSONB;
  v_theme_id_text TEXT;
  v_theme_id UUID;
  v_eligible_count INTEGER;
  v_candidate_count INTEGER;
  v_has_incomplete BOOLEAN;
  v_has_after_cutoff BOOLEAN;
  v_has_pool_mismatch BOOLEAN;
  v_expected_observation_id UUID;
  v_expected_input_sha256 TEXT;
  v_expected_candidate_pool TEXT;
  v_expected_missing_reason TEXT;
  v_allowed_parent_keys CONSTANT TEXT[] := ARRAY[
    'study_contract_id',
    'forecast_origin_manifest_id',
    'theme_inputs'
  ];
  v_allowed_child_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'babl_observation_id',
    'babl_input_sha256',
    'babl_candidate_pool',
    'babl_missing_reason'
  ];
BEGIN
  v_payload := public.tli_parse_canonical_json_v1(
    p_manifest_canonical_json,
    p_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> cardinality(v_allowed_parent_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE NOT (payload_key.key = ANY(v_allowed_parent_keys))
     )
     OR jsonb_typeof(v_payload -> 'study_contract_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'forecast_origin_manifest_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'theme_inputs') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'study-origin payload has unknown, missing, or malformed fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_study_contract_id := (v_payload ->> 'study_contract_id')::UUID;
    v_forecast_manifest_id := (v_payload ->> 'forecast_origin_manifest_id')::UUID;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'study-origin parent identifiers are invalid'
      USING ERRCODE = '22023';
  END;

  IF v_study_contract_id IS NULL OR v_forecast_manifest_id IS NULL THEN
    RAISE EXCEPTION 'study-origin parent identifiers are invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_payload ->> 'study_contract_id' IS DISTINCT FROM v_study_contract_id::text
     OR v_payload ->> 'forecast_origin_manifest_id' IS DISTINCT FROM v_forecast_manifest_id::text
  THEN
    RAISE EXCEPTION 'study-origin parent identifiers must be lowercase canonical UUIDs'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'tli-study-origin-v1|' || v_study_contract_id::text || '|' || v_forecast_manifest_id::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.tli_study_origin_manifests
    WHERE study_contract_id = v_study_contract_id
      AND forecast_origin_manifest_id = v_forecast_manifest_id
  ) THEN
    RAISE EXCEPTION 'study-origin binding already exists'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_study
  FROM public.tli_attention_study_contracts
  WHERE id = v_study_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study contract does not exist'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_forecast
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_forecast_manifest_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forecast origin manifest does not exist'
      USING ERRCODE = '55000';
  END IF;

  IF v_study.locked_at >= v_forecast.forecast_cutoff
     OR v_forecast.origin_date < v_study.first_origin_date
  THEN
    RAISE EXCEPTION 'study must be locked before the bound forecast cutoff and origin sequence'
      USING ERRCODE = '55000';
  END IF;

  SELECT array_agg(theme_id ORDER BY ordinality)
  INTO v_expected_theme_ids
  FROM jsonb_array_elements_text(v_forecast.expected_theme_ids)
    WITH ORDINALITY AS expected(theme_id, ordinality);

  SELECT array_agg(theme_input ->> 'theme_id' ORDER BY ordinality)
  INTO v_child_theme_ids
  FROM jsonb_array_elements(v_payload -> 'theme_inputs')
    WITH ORDINALITY AS children(theme_input, ordinality);

  IF v_child_theme_ids IS DISTINCT FROM v_expected_theme_ids THEN
    RAISE EXCEPTION 'study-origin child keys must exactly equal forecast expected themes'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::INTEGER INTO v_forecast_child_count
  FROM public.tli_forecast_origin_theme_inputs
  WHERE forecast_origin_manifest_id = v_forecast_manifest_id;

  IF v_forecast_child_count IS DISTINCT FROM v_forecast.expected_theme_count THEN
    RAISE EXCEPTION 'forecast origin manifest has incomplete children'
      USING ERRCODE = '55000';
  END IF;

  FOR v_theme_input IN
    SELECT theme_input
    FROM jsonb_array_elements(v_payload -> 'theme_inputs') AS children(theme_input)
  LOOP
    IF jsonb_typeof(v_theme_input) IS DISTINCT FROM 'object'
       OR public.tli_jsonb_object_key_count(v_theme_input) <> cardinality(v_allowed_child_keys)
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(v_theme_input) AS child_key(key)
         WHERE NOT (child_key.key = ANY(v_allowed_child_keys))
       )
       OR jsonb_typeof(v_theme_input -> 'theme_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_theme_input -> 'babl_observation_id') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'babl_input_sha256') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'babl_candidate_pool') NOT IN ('string','null')
       OR jsonb_typeof(v_theme_input -> 'babl_missing_reason') NOT IN ('string','null')
    THEN
      RAISE EXCEPTION 'study-origin theme input has unknown or missing fields'
        USING ERRCODE = '22023';
    END IF;

    v_theme_id_text := v_theme_input ->> 'theme_id';
    IF v_theme_id_text IS NULL
       OR v_theme_id_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'study-origin theme_id must be a lowercase UUID'
        USING ERRCODE = '22023';
    END IF;
    v_theme_id := v_theme_id_text::UUID;

    SELECT
      count(*) FILTER (
        WHERE source_run.status = 'complete'
          AND observation.computed_at <= v_forecast.forecast_cutoff
          AND source_run.collected_at <= v_forecast.forecast_cutoff
          AND source_run.completed_at <= v_forecast.forecast_cutoff
          AND source_snapshot.created_at <= v_forecast.forecast_cutoff
          AND observation.candidate_pool = source_snapshot.candidate_pool
          AND source_snapshot.candidate_pool = source_comparison_run.candidate_pool
          AND source_comparison_run.status IN ('complete','published')
      )::INTEGER,
      count(*)::INTEGER,
      COALESCE(bool_or(source_run.status <> 'complete'), false),
      COALESCE(bool_or(
        observation.computed_at > v_forecast.forecast_cutoff
        OR source_run.collected_at > v_forecast.forecast_cutoff
        OR source_run.completed_at > v_forecast.forecast_cutoff
        OR source_snapshot.created_at > v_forecast.forecast_cutoff
      ), false),
      COALESCE(bool_or(
        observation.candidate_pool IS DISTINCT FROM source_snapshot.candidate_pool
        OR source_snapshot.candidate_pool IS DISTINCT FROM source_comparison_run.candidate_pool
      ), false)
    INTO
      v_eligible_count,
      v_candidate_count,
      v_has_incomplete,
      v_has_after_cutoff,
      v_has_pool_mismatch
    FROM public.tli_babl_phase_observations AS observation
    JOIN public.tli_collection_runs AS source_run
      ON source_run.id = observation.collection_run_id
     AND source_run.source = 'babl_phase'
    JOIN public.prediction_snapshots_v2 AS source_snapshot
     ON source_snapshot.id = observation.source_prediction_snapshot_id
     AND source_snapshot.theme_id = observation.theme_id
     AND source_snapshot.snapshot_date = observation.snapshot_date
     AND source_snapshot.phase = observation.phase
     AND source_snapshot.algorithm_version = observation.algorithm_version
     AND source_snapshot.comparison_spec_version = observation.comparison_spec_version
     AND source_snapshot.evaluation_horizon_days = observation.evaluation_horizon_days
     AND source_snapshot.created_at = observation.computed_at
     AND source_snapshot.run_type = 'prod'
    JOIN public.theme_comparison_runs_v2 AS source_comparison_run
      ON source_comparison_run.id = source_snapshot.comparison_run_id
     AND source_comparison_run.current_theme_id = observation.theme_id
     AND source_comparison_run.run_date = observation.snapshot_date
     AND source_comparison_run.algorithm_version = observation.algorithm_version
     AND source_comparison_run.comparison_spec_version = observation.comparison_spec_version
     AND source_comparison_run.run_type = 'prod'
    WHERE observation.theme_id = v_theme_id
      AND observation.snapshot_date = v_forecast.origin_date
      AND observation.algorithm_version = v_study.babl_algorithm_version
      AND observation.comparison_spec_version = v_study.babl_comparison_spec_version
      AND observation.evaluation_horizon_days = v_study.babl_evaluation_horizon_days;

    v_expected_observation_id := NULL;
    v_expected_input_sha256 := NULL;
    v_expected_candidate_pool := NULL;
    v_expected_missing_reason := NULL;

    IF v_eligible_count > 1 THEN
      v_expected_missing_reason := 'multiple_matching_observations';
    ELSIF v_eligible_count = 1 THEN
      SELECT observation.id, observation.payload_hash, observation.candidate_pool
      INTO STRICT v_expected_observation_id, v_expected_input_sha256, v_expected_candidate_pool
      FROM public.tli_babl_phase_observations AS observation
      JOIN public.tli_collection_runs AS source_run
        ON source_run.id = observation.collection_run_id
       AND source_run.source = 'babl_phase'
       AND source_run.status = 'complete'
       AND source_run.collected_at <= v_forecast.forecast_cutoff
       AND source_run.completed_at <= v_forecast.forecast_cutoff
      JOIN public.prediction_snapshots_v2 AS source_snapshot
       ON source_snapshot.id = observation.source_prediction_snapshot_id
       AND source_snapshot.theme_id = observation.theme_id
       AND source_snapshot.snapshot_date = observation.snapshot_date
       AND source_snapshot.phase = observation.phase
       AND source_snapshot.algorithm_version = observation.algorithm_version
       AND source_snapshot.comparison_spec_version = observation.comparison_spec_version
       AND source_snapshot.evaluation_horizon_days = observation.evaluation_horizon_days
       AND source_snapshot.created_at = observation.computed_at
       AND source_snapshot.run_type = 'prod'
       AND source_snapshot.created_at <= v_forecast.forecast_cutoff
       AND source_snapshot.candidate_pool = observation.candidate_pool
      JOIN public.theme_comparison_runs_v2 AS source_comparison_run
        ON source_comparison_run.id = source_snapshot.comparison_run_id
       AND source_comparison_run.current_theme_id = observation.theme_id
       AND source_comparison_run.run_date = observation.snapshot_date
       AND source_comparison_run.algorithm_version = observation.algorithm_version
       AND source_comparison_run.comparison_spec_version = observation.comparison_spec_version
       AND source_comparison_run.run_type = 'prod'
       AND source_comparison_run.status IN ('complete','published')
       AND source_comparison_run.candidate_pool = observation.candidate_pool
      WHERE observation.theme_id = v_theme_id
        AND observation.snapshot_date = v_forecast.origin_date
        AND observation.algorithm_version = v_study.babl_algorithm_version
        AND observation.comparison_spec_version = v_study.babl_comparison_spec_version
        AND observation.evaluation_horizon_days = v_study.babl_evaluation_horizon_days
        AND observation.computed_at <= v_forecast.forecast_cutoff;
    ELSIF v_has_incomplete THEN
      v_expected_missing_reason := 'source_run_not_complete';
    ELSIF v_has_after_cutoff THEN
      v_expected_missing_reason := 'source_after_cutoff';
    ELSIF v_has_pool_mismatch THEN
      v_expected_missing_reason := 'source_pool_mismatch';
    ELSIF v_candidate_count = 0 THEN
      v_expected_missing_reason := 'no_matching_observation';
    ELSE
      v_expected_missing_reason := 'no_matching_observation';
    END IF;

    IF v_expected_observation_id IS NOT NULL THEN
      IF v_theme_input ->> 'babl_observation_id' IS DISTINCT FROM v_expected_observation_id::text
         OR v_theme_input ->> 'babl_input_sha256' IS DISTINCT FROM v_expected_input_sha256
         OR v_theme_input ->> 'babl_candidate_pool' IS DISTINCT FROM v_expected_candidate_pool
         OR v_theme_input -> 'babl_missing_reason' IS DISTINCT FROM 'null'::JSONB
      THEN
        RAISE EXCEPTION 'caller-supplied B-Abl id, hash, or pool does not match the exact source prod observation'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      IF v_theme_input -> 'babl_observation_id' IS DISTINCT FROM 'null'::JSONB
         OR v_theme_input -> 'babl_input_sha256' IS DISTINCT FROM 'null'::JSONB
         OR v_theme_input -> 'babl_candidate_pool' IS DISTINCT FROM 'null'::JSONB
         OR v_theme_input ->> 'babl_missing_reason' IS DISTINCT FROM v_expected_missing_reason
      THEN
        RAISE EXCEPTION 'caller-supplied B-Abl missing state does not match the derived reason'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.tli_study_origin_manifests (
    id,
    study_contract_id,
    forecast_origin_manifest_id,
    payload_sha256,
    created_at
  ) VALUES (
    v_manifest_id,
    v_study_contract_id,
    v_forecast_manifest_id,
    p_payload_sha256,
    clock_timestamp()
  );

  INSERT INTO public.tli_study_origin_theme_inputs (
    study_origin_manifest_id,
    theme_id,
    babl_observation_id,
    babl_input_sha256,
    babl_candidate_pool,
    babl_missing_reason
  )
  SELECT
    v_manifest_id,
    (theme_input ->> 'theme_id')::UUID,
    NULLIF(theme_input ->> 'babl_observation_id', '')::UUID,
    theme_input ->> 'babl_input_sha256',
    theme_input ->> 'babl_candidate_pool',
    theme_input ->> 'babl_missing_reason'
  FROM jsonb_array_elements(v_payload -> 'theme_inputs') AS children(theme_input);

  RETURN v_manifest_id;
END;
$$;

ALTER TABLE public.tli_collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_interest_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_news_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_babl_phase_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_attention_study_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_forecast_origin_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_forecast_origin_theme_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_study_origin_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_study_origin_theme_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_tli_collection_runs
  ON public.tli_collection_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_interest_observations
  ON public.tli_interest_observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_news_observations
  ON public.tli_news_observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_babl_phase_observations
  ON public.tli_babl_phase_observations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_attention_study_contracts
  ON public.tli_attention_study_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_forecast_origin_manifests
  ON public.tli_forecast_origin_manifests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_forecast_origin_theme_inputs
  ON public.tli_forecast_origin_theme_inputs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_study_origin_manifests
  ON public.tli_study_origin_manifests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_tli_study_origin_theme_inputs
  ON public.tli_study_origin_theme_inputs FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.tli_collection_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_interest_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_news_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_babl_phase_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_attention_study_contracts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_forecast_origin_manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_forecast_origin_theme_inputs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_study_origin_manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tli_study_origin_theme_inputs FROM PUBLIC, anon, authenticated;

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  public.tli_collection_runs,
  public.tli_interest_observations,
  public.tli_news_observations,
  public.tli_babl_phase_observations,
  public.tli_attention_study_contracts,
  public.tli_forecast_origin_manifests,
  public.tli_forecast_origin_theme_inputs,
  public.tli_study_origin_manifests,
  public.tli_study_origin_theme_inputs
FROM service_role;

REVOKE INSERT ON TABLE
  public.tli_attention_study_contracts,
  public.tli_forecast_origin_manifests,
  public.tli_forecast_origin_theme_inputs,
  public.tli_study_origin_manifests,
  public.tli_study_origin_theme_inputs
FROM service_role;

GRANT SELECT ON TABLE
  public.tli_collection_runs,
  public.tli_interest_observations,
  public.tli_news_observations,
  public.tli_babl_phase_observations,
  public.tli_attention_study_contracts,
  public.tli_forecast_origin_manifests,
  public.tli_forecast_origin_theme_inputs,
  public.tli_study_origin_manifests,
  public.tli_study_origin_theme_inputs
TO service_role;

GRANT INSERT ON TABLE
  public.tli_collection_runs,
  public.tli_interest_observations,
  public.tli_news_observations,
  public.tli_babl_phase_observations
TO service_role;

REVOKE EXECUTE ON FUNCTION public.tli_sha256_text(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_sha256_json_string_array(TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_sha256_ordered_json_string_array(TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_json_has_duplicate_keys(JSON)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_jsonb_object_key_count(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.tli_parse_canonical_json_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reject_tli_append_only_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.validate_tli_collection_run_observations()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_tli_forecast_origin_manifest(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tli_forecast_origin_manifest(TEXT, TEXT)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.bind_tli_study_origin(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_tli_study_origin(TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.tli_collection_runs IS
  'Immutable source request/response envelope. Parent and observations must be inserted in one transaction.';
COMMENT ON COLUMN public.tli_collection_runs.expected_keys_sha256 IS
  'canonical-json-v1 SHA-256 of a C-sorted JSON string array. Interest keys are theme|date|source; news keys theme|date; B-Abl keys theme|date|algorithm|pool|spec|horizon.';
COMMENT ON TABLE public.tli_attention_study_contracts IS
  'Pre-outcome B-Abl study lock pinned to one enabled comparison_v4_control row and trusted Git attestation.';
COMMENT ON TABLE public.tli_forecast_origin_manifests IS
  'Cycle-independent Monday forecast cutoff and exact expected theme universe.';
COMMENT ON TABLE public.tli_study_origin_manifests IS
  'Immutable binding of one pre-locked study contract to one universal forecast origin.';
COMMENT ON FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
  'Locks tli-attention-study-v1 without querying theme outcomes, feature values, coverage, scores, or OOS metrics.';
COMMENT ON FUNCTION public.create_tli_forecast_origin_manifest(TEXT, TEXT) IS
  'Atomically validates and stores exact parent/child forecast provenance; identical payload retries are idempotent.';
COMMENT ON FUNCTION public.bind_tli_study_origin(TEXT, TEXT) IS
  'Atomically derives and validates exact prod B-Abl provenance or one deterministic missing reason per theme.';

COMMIT;
