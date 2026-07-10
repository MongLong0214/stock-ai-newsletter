BEGIN;

ALTER TABLE public.tli_attention_study_contracts
  DROP CONSTRAINT tli_attention_study_contracts_git_commit_sha_check;
ALTER TABLE public.tli_attention_study_contracts
  ADD CONSTRAINT tli_attention_study_contracts_git_commit_sha_check
  CHECK (git_commit_sha ~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$');

ALTER TABLE public.tli_attention_study_contracts
  DROP CONSTRAINT tli_attention_study_contracts_git_blob_sha_check;
ALTER TABLE public.tli_attention_study_contracts
  ADD CONSTRAINT tli_attention_study_contracts_git_blob_sha_check
  CHECK (git_blob_sha ~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.append_tli_collection_run(
  p_run_canonical_json TEXT,
  p_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_run JSONB;
  v_observations JSONB;
  v_observation JSONB;
  v_run_id UUID := extensions.gen_random_uuid();
  v_source TEXT;
  v_status TEXT;
  v_request_window_start DATE;
  v_request_window_end DATE;
  v_source_max_date DATE;
  v_requested_at TIMESTAMPTZ;
  v_collected_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_expected_row_count INTEGER;
  v_observed_row_count INTEGER;
  v_expected_keys_sha256 TEXT;
  v_keyword_group_hash TEXT;
  v_observation_keys TEXT[] := ARRAY[]::TEXT[];
  v_theme_id UUID;
  v_observation_date DATE;
  v_observation_timestamp TIMESTAMPTZ;
  v_source_prediction_snapshot_id UUID;
  v_actual_source_max_date DATE;
  v_expected_babl_payload_hash TEXT;
  v_root_allowed_keys CONSTANT TEXT[] := ARRAY['run', 'observations'];
  v_run_allowed_keys CONSTANT TEXT[] := ARRAY[
    'source',
    'contract_version',
    'request_window_start',
    'request_window_end',
    'request_payload',
    'response_payload',
    'request_sha256',
    'response_sha256',
    'keyword_group_hash',
    'expected_universe_hash',
    'expected_keys_sha256',
    'expected_row_count',
    'observed_row_count',
    'source_max_date',
    'requested_at',
    'collected_at',
    'completed_at',
    'status',
    'failure_summary'
  ];
  v_interest_allowed_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'trading_date',
    'source',
    'raw_value',
    'normalized',
    'anchor_scaled_value',
    'keyword_epoch'
  ];
  v_news_allowed_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'article_date',
    'article_count',
    'query_hash',
    'collected_at'
  ];
  v_babl_allowed_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'snapshot_date',
    'phase',
    'algorithm_version',
    'candidate_pool',
    'comparison_spec_version',
    'evaluation_horizon_days',
    'source_prediction_snapshot_id',
    'computed_at',
    'payload_hash'
  ];
BEGIN
  IF p_run_canonical_json IS NOT NULL
     AND octet_length(p_run_canonical_json) > 16777216
  THEN
    RAISE EXCEPTION 'collection append payload exceeds the 16 MiB contract limit'
      USING ERRCODE = '54000';
  END IF;

  v_payload := public.tli_require_canonical_json_v1(
    p_run_canonical_json,
    p_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> cardinality(v_root_allowed_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE NOT (payload_key.key = ANY(v_root_allowed_keys))
     )
     OR jsonb_typeof(v_payload -> 'run') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_payload -> 'observations') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'collection append payload must contain exact run and observations fields'
      USING ERRCODE = '22023';
  END IF;

  v_run := v_payload -> 'run';
  v_observations := v_payload -> 'observations';

  IF jsonb_array_length(v_observations) > 10000 THEN
    RAISE EXCEPTION 'collection append observation count exceeds the contract limit'
      USING ERRCODE = '54000';
  END IF;

  IF public.tli_jsonb_object_key_count(v_run) <> cardinality(v_run_allowed_keys)
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_run) AS run_key(key)
       WHERE NOT (run_key.key = ANY(v_run_allowed_keys))
     )
     OR jsonb_typeof(v_run -> 'source') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'contract_version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'request_window_start') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'request_window_end') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'request_payload') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_run -> 'response_sha256') NOT IN ('string', 'null')
     OR jsonb_typeof(v_run -> 'keyword_group_hash') NOT IN ('string', 'null')
     OR jsonb_typeof(v_run -> 'request_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'expected_universe_hash') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'expected_keys_sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'expected_row_count') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_run -> 'observed_row_count') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_run -> 'source_max_date') NOT IN ('string', 'null')
     OR jsonb_typeof(v_run -> 'requested_at') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'collected_at') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'completed_at') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'status') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_run -> 'failure_summary') NOT IN ('object', 'null')
  THEN
    RAISE EXCEPTION 'collection run has unknown, missing, or invalid fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_source := v_run ->> 'source';
    v_status := v_run ->> 'status';
    v_request_window_start := (v_run ->> 'request_window_start')::DATE;
    v_request_window_end := (v_run ->> 'request_window_end')::DATE;
    v_source_max_date := (v_run ->> 'source_max_date')::DATE;
    v_requested_at := (v_run ->> 'requested_at')::TIMESTAMPTZ;
    v_collected_at := (v_run ->> 'collected_at')::TIMESTAMPTZ;
    v_completed_at := (v_run ->> 'completed_at')::TIMESTAMPTZ;
    v_expected_row_count := (v_run ->> 'expected_row_count')::INTEGER;
    v_observed_row_count := (v_run ->> 'observed_row_count')::INTEGER;
    v_expected_keys_sha256 := v_run ->> 'expected_keys_sha256';
    v_keyword_group_hash := v_run ->> 'keyword_group_hash';
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'collection run contains invalid typed values'
      USING ERRCODE = '22023';
  END;

  IF v_expected_row_count > 10000 OR v_observed_row_count > 10000 THEN
    RAISE EXCEPTION 'collection run declared count exceeds the contract limit'
      USING ERRCODE = '54000';
  END IF;

  IF char_length(v_run ->> 'contract_version') NOT BETWEEN 1 AND 128
     OR v_run ->> 'request_window_start' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_run ->> 'request_window_start' IS DISTINCT FROM to_char(v_request_window_start, 'YYYY-MM-DD')
     OR v_run ->> 'request_window_end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_run ->> 'request_window_end' IS DISTINCT FROM to_char(v_request_window_end, 'YYYY-MM-DD')
     OR (
       v_source_max_date IS NOT NULL
       AND (
         v_run ->> 'source_max_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR v_run ->> 'source_max_date' IS DISTINCT FROM to_char(v_source_max_date, 'YYYY-MM-DD')
       )
     )
     OR v_run ->> 'expected_row_count' !~ '^(0|[1-9][0-9]*)$'
     OR v_run ->> 'observed_row_count' !~ '^(0|[1-9][0-9]*)$'
     OR v_run ->> 'requested_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR v_run ->> 'requested_at' IS DISTINCT FROM
       to_char(v_requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR v_run ->> 'collected_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR v_run ->> 'collected_at' IS DISTINCT FROM
       to_char(v_collected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR v_run ->> 'completed_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR v_run ->> 'completed_at' IS DISTINCT FROM
       to_char(v_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR v_run ->> 'request_sha256' !~ '^[0-9a-f]{64}$'
     OR v_run ->> 'expected_universe_hash' !~ '^[0-9a-f]{64}$'
     OR v_expected_keys_sha256 !~ '^[0-9a-f]{64}$'
     OR (
       v_run ->> 'response_sha256' IS NOT NULL
       AND v_run ->> 'response_sha256' !~ '^[0-9a-f]{64}$'
     )
     OR (
       v_keyword_group_hash IS NOT NULL
       AND v_keyword_group_hash !~ '^[0-9a-f]{64}$'
     )
     OR v_run ->> 'request_sha256' IS DISTINCT FROM
       public.tli_sha256_text(public.tli_render_canonical_json_v1(v_run -> 'request_payload'))
     OR (
       (v_run -> 'response_payload') = 'null'::JSONB
       AND v_run ->> 'response_sha256' IS NOT NULL
     )
     OR (
       (v_run -> 'response_payload') <> 'null'::JSONB
       AND (
         v_run ->> 'response_sha256' IS NULL
         OR v_run ->> 'response_sha256' IS DISTINCT FROM
           public.tli_sha256_text(public.tli_render_canonical_json_v1(v_run -> 'response_payload'))
       )
     )
  THEN
    RAISE EXCEPTION 'collection run hashes, counts, or canonical typed values are invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_observed_row_count IS DISTINCT FROM jsonb_array_length(v_observations)
     OR v_expected_row_count < v_observed_row_count
  THEN
    RAISE EXCEPTION 'collection run declared counts do not match the observation payload'
      USING ERRCODE = '55000';
  END IF;

  IF v_status = 'complete' THEN
    IF v_expected_row_count IS DISTINCT FROM v_observed_row_count
       OR (v_run -> 'failure_summary') <> 'null'::JSONB
    THEN
      RAISE EXCEPTION 'complete collection run does not contain the exact expected key set'
        USING ERRCODE = '55000';
    END IF;
  ELSIF v_status = 'partial' THEN
    IF (v_run -> 'failure_summary') = 'null'::JSONB
       OR v_observed_row_count = 0
       OR v_expected_row_count = v_observed_row_count
    THEN
      RAISE EXCEPTION 'partial collection run must contain an explicit non-empty deficit'
        USING ERRCODE = '55000';
    END IF;
  ELSIF v_status = 'failed' THEN
    IF (v_run -> 'failure_summary') = 'null'::JSONB
       OR v_observed_row_count <> 0
    THEN
      RAISE EXCEPTION 'failed collection run must contain failure details and zero observations'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'collection run status is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_source = 'babl_phase' AND v_status = 'complete' AND v_observed_row_count = 0 THEN
    RAISE EXCEPTION 'complete B-Abl collection run requires at least one exact prod observation'
      USING ERRCODE = '55000';
  END IF;

  CASE v_source
    WHEN 'naver_datalab' THEN
      IF v_keyword_group_hash IS NULL THEN
        RAISE EXCEPTION 'naver_datalab run requires keyword_group_hash'
          USING ERRCODE = '22023';
      END IF;

      FOR v_observation IN
        SELECT value FROM jsonb_array_elements(v_observations)
      LOOP
        IF jsonb_typeof(v_observation) IS DISTINCT FROM 'object'
           OR public.tli_jsonb_object_key_count(v_observation) <> cardinality(v_interest_allowed_keys)
           OR EXISTS (
             SELECT 1
             FROM jsonb_object_keys(v_observation) AS observation_key(key)
             WHERE NOT (observation_key.key = ANY(v_interest_allowed_keys))
           )
           OR jsonb_typeof(v_observation -> 'theme_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'trading_date') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'source') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'raw_value') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_observation -> 'normalized') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_observation -> 'anchor_scaled_value') NOT IN ('number', 'null')
           OR jsonb_typeof(v_observation -> 'keyword_epoch') IS DISTINCT FROM 'number'
        THEN
          RAISE EXCEPTION 'naver_datalab observation has unknown, missing, or invalid fields'
            USING ERRCODE = '22023';
        END IF;

        BEGIN
          v_theme_id := (v_observation ->> 'theme_id')::UUID;
          v_observation_date := (v_observation ->> 'trading_date')::DATE;
          PERFORM (v_observation ->> 'raw_value')::INTEGER;
          PERFORM (v_observation ->> 'normalized')::NUMERIC;
          PERFORM (v_observation ->> 'anchor_scaled_value')::NUMERIC;
          PERFORM (v_observation ->> 'keyword_epoch')::INTEGER;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'naver_datalab observation contains invalid typed values'
            USING ERRCODE = '22023';
        END;

        IF v_observation ->> 'theme_id' IS DISTINCT FROM v_theme_id::TEXT
           OR v_observation ->> 'trading_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           OR v_observation ->> 'trading_date' IS DISTINCT FROM to_char(v_observation_date, 'YYYY-MM-DD')
           OR v_observation_date < v_request_window_start
           OR v_observation_date > v_request_window_end
           OR v_observation ->> 'source' IS DISTINCT FROM 'naver_datalab'
           OR v_observation ->> 'raw_value' !~ '^-?(0|[1-9][0-9]*)$'
           OR v_observation ->> 'keyword_epoch' !~ '^[1-9][0-9]*$'
        THEN
          RAISE EXCEPTION 'naver_datalab observation violates its source contract'
            USING ERRCODE = '22023';
        END IF;

        v_actual_source_max_date := CASE
          WHEN v_actual_source_max_date IS NULL OR v_observation_date > v_actual_source_max_date
            THEN v_observation_date
          ELSE v_actual_source_max_date
        END;
      END LOOP;

      SELECT COALESCE(
        array_agg(
          observation.theme_id::TEXT || '|' ||
          to_char(observation.trading_date, 'YYYY-MM-DD') || '|naver_datalab'
        ),
        ARRAY[]::TEXT[]
      )
      INTO v_observation_keys
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        trading_date DATE
      );

    WHEN 'naver_news' THEN
      IF v_keyword_group_hash IS NULL THEN
        RAISE EXCEPTION 'naver_news run requires keyword_group_hash'
          USING ERRCODE = '22023';
      END IF;

      FOR v_observation IN
        SELECT value FROM jsonb_array_elements(v_observations)
      LOOP
        IF jsonb_typeof(v_observation) IS DISTINCT FROM 'object'
           OR public.tli_jsonb_object_key_count(v_observation) <> cardinality(v_news_allowed_keys)
           OR EXISTS (
             SELECT 1
             FROM jsonb_object_keys(v_observation) AS observation_key(key)
             WHERE NOT (observation_key.key = ANY(v_news_allowed_keys))
           )
           OR jsonb_typeof(v_observation -> 'theme_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'article_date') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'article_count') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_observation -> 'query_hash') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'collected_at') IS DISTINCT FROM 'string'
        THEN
          RAISE EXCEPTION 'naver_news observation has unknown, missing, or invalid fields'
            USING ERRCODE = '22023';
        END IF;

        BEGIN
          v_theme_id := (v_observation ->> 'theme_id')::UUID;
          v_observation_date := (v_observation ->> 'article_date')::DATE;
          PERFORM (v_observation ->> 'article_count')::INTEGER;
          v_observation_timestamp := (v_observation ->> 'collected_at')::TIMESTAMPTZ;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'naver_news observation contains invalid typed values'
            USING ERRCODE = '22023';
        END;

        IF v_observation ->> 'theme_id' IS DISTINCT FROM v_theme_id::TEXT
           OR v_observation ->> 'article_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           OR v_observation ->> 'article_date' IS DISTINCT FROM to_char(v_observation_date, 'YYYY-MM-DD')
           OR v_observation_date < v_request_window_start
           OR v_observation_date > v_request_window_end
           OR v_observation ->> 'article_count' !~ '^(0|[1-9][0-9]*)$'
           OR v_observation ->> 'query_hash' IS DISTINCT FROM v_keyword_group_hash
           OR v_observation ->> 'collected_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
           OR v_observation ->> 'collected_at' IS DISTINCT FROM
             to_char(v_observation_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        THEN
          RAISE EXCEPTION 'naver_news observation violates its source contract'
            USING ERRCODE = '22023';
        END IF;

        v_actual_source_max_date := CASE
          WHEN v_actual_source_max_date IS NULL OR v_observation_date > v_actual_source_max_date
            THEN v_observation_date
          ELSE v_actual_source_max_date
        END;
      END LOOP;

      SELECT COALESCE(
        array_agg(
          observation.theme_id::TEXT || '|' || to_char(observation.article_date, 'YYYY-MM-DD')
        ),
        ARRAY[]::TEXT[]
      )
      INTO v_observation_keys
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        article_date DATE
      );

    WHEN 'babl_phase' THEN
      IF v_keyword_group_hash IS NOT NULL THEN
        RAISE EXCEPTION 'babl_phase run cannot contain keyword_group_hash'
          USING ERRCODE = '22023';
      END IF;

      FOR v_observation IN
        SELECT value FROM jsonb_array_elements(v_observations)
      LOOP
        IF jsonb_typeof(v_observation) IS DISTINCT FROM 'object'
           OR public.tli_jsonb_object_key_count(v_observation) <> cardinality(v_babl_allowed_keys)
           OR EXISTS (
             SELECT 1
             FROM jsonb_object_keys(v_observation) AS observation_key(key)
             WHERE NOT (observation_key.key = ANY(v_babl_allowed_keys))
           )
           OR jsonb_typeof(v_observation -> 'theme_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'snapshot_date') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'phase') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'algorithm_version') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'candidate_pool') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'comparison_spec_version') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'evaluation_horizon_days') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_observation -> 'source_prediction_snapshot_id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'computed_at') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_observation -> 'payload_hash') IS DISTINCT FROM 'string'
        THEN
          RAISE EXCEPTION 'babl_phase observation has unknown, missing, or invalid fields'
            USING ERRCODE = '22023';
        END IF;

        BEGIN
          v_theme_id := (v_observation ->> 'theme_id')::UUID;
          v_observation_date := (v_observation ->> 'snapshot_date')::DATE;
          v_source_prediction_snapshot_id :=
            (v_observation ->> 'source_prediction_snapshot_id')::UUID;
          v_observation_timestamp := (v_observation ->> 'computed_at')::TIMESTAMPTZ;
          PERFORM (v_observation ->> 'evaluation_horizon_days')::INTEGER;
        EXCEPTION WHEN others THEN
          RAISE EXCEPTION 'babl_phase observation contains invalid typed values'
            USING ERRCODE = '22023';
        END;

        IF v_observation ->> 'theme_id' IS DISTINCT FROM v_theme_id::TEXT
           OR v_observation ->> 'snapshot_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           OR v_observation ->> 'snapshot_date' IS DISTINCT FROM to_char(v_observation_date, 'YYYY-MM-DD')
           OR v_observation_date < v_request_window_start
           OR v_observation_date > v_request_window_end
           OR NULLIF(v_observation ->> 'phase', '') IS NULL
           OR char_length(v_observation ->> 'phase') > 128
           OR NULLIF(v_observation ->> 'algorithm_version', '') IS NULL
           OR char_length(v_observation ->> 'algorithm_version') > 128
           OR NULLIF(v_observation ->> 'candidate_pool', '') IS NULL
           OR char_length(v_observation ->> 'candidate_pool') > 128
           OR NULLIF(v_observation ->> 'comparison_spec_version', '') IS NULL
           OR char_length(v_observation ->> 'comparison_spec_version') > 128
           OR v_observation ->> 'evaluation_horizon_days' !~ '^[1-9][0-9]*$'
           OR v_observation ->> 'source_prediction_snapshot_id' IS DISTINCT FROM
             v_source_prediction_snapshot_id::TEXT
           OR v_observation ->> 'computed_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
           OR v_observation ->> 'computed_at' IS DISTINCT FROM
             to_char(v_observation_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           OR v_observation ->> 'payload_hash' !~ '^[0-9a-f]{64}$'
        THEN
          RAISE EXCEPTION 'babl_phase observation violates its source contract'
            USING ERRCODE = '22023';
        END IF;

        v_expected_babl_payload_hash := public.tli_sha256_text(
          public.tli_render_canonical_json_v1(
            jsonb_build_object(
              'algorithm_version', v_observation ->> 'algorithm_version',
              'candidate_pool', v_observation ->> 'candidate_pool',
              'comparison_spec_version', v_observation ->> 'comparison_spec_version',
              'computed_at', v_observation ->> 'computed_at',
              'evaluation_horizon_days', (v_observation ->> 'evaluation_horizon_days')::INTEGER,
              'phase', v_observation ->> 'phase',
              'snapshot_date', v_observation ->> 'snapshot_date',
              'source_prediction_snapshot_id', v_observation ->> 'source_prediction_snapshot_id',
              'theme_id', v_observation ->> 'theme_id'
            )
          )
        );

        IF v_observation ->> 'payload_hash' IS DISTINCT FROM v_expected_babl_payload_hash THEN
          RAISE EXCEPTION 'B-Abl observation payload hash does not match its canonical provenance'
            USING ERRCODE = '22023';
        END IF;

        v_actual_source_max_date := CASE
          WHEN v_actual_source_max_date IS NULL OR v_observation_date > v_actual_source_max_date
            THEN v_observation_date
          ELSE v_actual_source_max_date
        END;
      END LOOP;

      SELECT COALESCE(
        array_agg(
          observation.theme_id::TEXT || '|' ||
          to_char(observation.snapshot_date, 'YYYY-MM-DD') || '|' ||
          observation.algorithm_version || '|' || observation.candidate_pool || '|' ||
          observation.comparison_spec_version || '|' || observation.evaluation_horizon_days::TEXT
        ),
        ARRAY[]::TEXT[]
      )
      INTO v_observation_keys
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        snapshot_date DATE,
        algorithm_version TEXT,
        candidate_pool TEXT,
        comparison_spec_version TEXT,
        evaluation_horizon_days INTEGER
      );

      IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(v_observations) AS observation(
          theme_id UUID,
          snapshot_date DATE,
          phase TEXT,
          algorithm_version TEXT,
          candidate_pool TEXT,
          comparison_spec_version TEXT,
          evaluation_horizon_days INTEGER,
          source_prediction_snapshot_id UUID,
          computed_at TIMESTAMPTZ,
          payload_hash TEXT
        )
        LEFT JOIN public.prediction_snapshots_v2 AS source_snapshot
          ON source_snapshot.id = observation.source_prediction_snapshot_id
        LEFT JOIN public.theme_comparison_runs_v2 AS source_comparison_run
          ON source_comparison_run.id = source_snapshot.comparison_run_id
        WHERE source_snapshot.id IS NULL
          OR source_snapshot.theme_id IS DISTINCT FROM observation.theme_id
          OR source_snapshot.snapshot_date IS DISTINCT FROM observation.snapshot_date
          OR source_snapshot.phase IS DISTINCT FROM observation.phase
          OR source_snapshot.algorithm_version IS DISTINCT FROM observation.algorithm_version
          OR source_snapshot.candidate_pool IS DISTINCT FROM observation.candidate_pool
          OR source_snapshot.comparison_spec_version IS DISTINCT FROM observation.comparison_spec_version
          OR source_snapshot.evaluation_horizon_days IS DISTINCT FROM observation.evaluation_horizon_days
          OR source_snapshot.created_at IS DISTINCT FROM observation.computed_at
          OR source_snapshot.run_type IS DISTINCT FROM 'prod'
          OR source_comparison_run.id IS NULL
          OR source_comparison_run.current_theme_id IS DISTINCT FROM observation.theme_id
          OR source_comparison_run.run_date IS DISTINCT FROM observation.snapshot_date
          OR source_comparison_run.algorithm_version IS DISTINCT FROM observation.algorithm_version
          OR source_comparison_run.candidate_pool IS DISTINCT FROM observation.candidate_pool
          OR source_comparison_run.comparison_spec_version IS DISTINCT FROM observation.comparison_spec_version
          OR source_comparison_run.run_type IS DISTINCT FROM 'prod'
      ) THEN
        RAISE EXCEPTION 'B-Abl observation provenance does not match its exact prod source'
          USING ERRCODE = '22023';
      END IF;

    ELSE
      RAISE EXCEPTION 'collection run source is invalid'
        USING ERRCODE = '22023';
  END CASE;

  IF v_source_max_date IS DISTINCT FROM v_actual_source_max_date THEN
    RAISE EXCEPTION 'collection run source_max_date does not match its observations'
      USING ERRCODE = '22023';
  END IF;

  IF v_status = 'complete' THEN
    IF v_expected_row_count IS DISTINCT FROM v_observed_row_count
       OR v_expected_keys_sha256 IS DISTINCT FROM public.tli_sha256_json_string_array(v_observation_keys)
    THEN
      RAISE EXCEPTION 'complete collection run does not contain the exact expected key set'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  INSERT INTO public.tli_collection_runs (
    id,
    source,
    contract_version,
    request_window_start,
    request_window_end,
    request_payload,
    response_payload,
    request_sha256,
    response_sha256,
    keyword_group_hash,
    expected_universe_hash,
    expected_keys_sha256,
    expected_row_count,
    observed_row_count,
    source_max_date,
    requested_at,
    collected_at,
    completed_at,
    status,
    failure_summary
  ) VALUES (
    v_run_id,
    v_source,
    v_run ->> 'contract_version',
    v_request_window_start,
    v_request_window_end,
    v_run -> 'request_payload',
    NULLIF(v_run -> 'response_payload', 'null'::JSONB),
    v_run ->> 'request_sha256',
    v_run ->> 'response_sha256',
    v_keyword_group_hash,
    v_run ->> 'expected_universe_hash',
    v_expected_keys_sha256,
    v_expected_row_count,
    v_observed_row_count,
    v_source_max_date,
    v_requested_at,
    v_collected_at,
    v_completed_at,
    v_status,
    NULLIF(v_run -> 'failure_summary', 'null'::JSONB)
  );

  CASE v_source
    WHEN 'naver_datalab' THEN
      INSERT INTO public.tli_interest_observations (
        collection_run_id,
        theme_id,
        trading_date,
        source,
        raw_value,
        normalized,
        anchor_scaled_value,
        keyword_epoch
      )
      SELECT
        v_run_id,
        observation.theme_id,
        observation.trading_date,
        observation.source,
        observation.raw_value,
        observation.normalized,
        observation.anchor_scaled_value,
        observation.keyword_epoch
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        trading_date DATE,
        source TEXT,
        raw_value INTEGER,
        normalized NUMERIC,
        anchor_scaled_value NUMERIC,
        keyword_epoch INTEGER
      );

    WHEN 'naver_news' THEN
      INSERT INTO public.tli_news_observations (
        collection_run_id,
        theme_id,
        article_date,
        article_count,
        query_hash,
        collected_at
      )
      SELECT
        v_run_id,
        observation.theme_id,
        observation.article_date,
        observation.article_count,
        observation.query_hash,
        observation.collected_at
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        article_date DATE,
        article_count INTEGER,
        query_hash TEXT,
        collected_at TIMESTAMPTZ
      );

    WHEN 'babl_phase' THEN
      INSERT INTO public.tli_babl_phase_observations (
        collection_run_id,
        theme_id,
        snapshot_date,
        phase,
        algorithm_version,
        candidate_pool,
        comparison_spec_version,
        evaluation_horizon_days,
        source_prediction_snapshot_id,
        computed_at,
        payload_hash
      )
      SELECT
        v_run_id,
        observation.theme_id,
        observation.snapshot_date,
        observation.phase,
        observation.algorithm_version,
        observation.candidate_pool,
        observation.comparison_spec_version,
        observation.evaluation_horizon_days,
        observation.source_prediction_snapshot_id,
        observation.computed_at,
        observation.payload_hash
      FROM jsonb_to_recordset(v_observations) AS observation(
        theme_id UUID,
        snapshot_date DATE,
        phase TEXT,
        algorithm_version TEXT,
        candidate_pool TEXT,
        comparison_spec_version TEXT,
        evaluation_horizon_days INTEGER,
        source_prediction_snapshot_id UUID,
        computed_at TIMESTAMPTZ,
        payload_hash TEXT
      );
  END CASE;

  RETURN v_run_id;
END;
$$;

ALTER FUNCTION public.append_tli_collection_run(TEXT, TEXT)
  OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.append_tli_collection_run(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_tli_collection_run(TEXT, TEXT)
  TO service_role;

REVOKE INSERT ON TABLE
  public.tli_collection_runs,
  public.tli_interest_observations,
  public.tli_news_observations,
  public.tli_babl_phase_observations
FROM service_role;

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
SET search_path = pg_catalog, extensions
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
  IF (p_contract_canonical_json IS NOT NULL
      AND octet_length(p_contract_canonical_json) > 1048576)
     OR (p_control_canonical_json IS NOT NULL
         AND octet_length(p_control_canonical_json) > 1048576)
  THEN
    RAISE EXCEPTION 'study lock canonical payload exceeds the 1 MiB contract limit'
      USING ERRCODE = '54000';
  END IF;

  v_payload := public.tli_require_canonical_json_v1(
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
  IF p_study_id IS NULL
     OR p_repo_relative_path IS DISTINCT FROM v_expected_path
     OR octet_length(p_repo_relative_path) > 512
     OR p_git_commit_sha IS NULL
     OR p_git_commit_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'
     OR p_git_blob_sha IS NULL
     OR p_git_blob_sha !~ '^[0-9a-f]{40}$|^[0-9a-f]{64}$'
     OR p_verifier_code_sha IS NULL
     OR p_verifier_code_sha !~ '^[0-9a-f]{64}$'
     OR NULLIF(p_verifier_version, '') IS NULL
     OR octet_length(p_verifier_version) > 128
     OR p_verified_at IS NULL
     OR NOT isfinite(p_verified_at)
  THEN
    RAISE EXCEPTION 'trusted Git attestation is invalid or does not match the exact study path'
      USING ERRCODE = '22023';
  END IF;

  v_control_payload := public.tli_require_canonical_json_v1(
    p_control_canonical_json,
    v_control_sha256
  );

  PERFORM pg_advisory_xact_lock(hashtextextended('tli-attention-study-lock-v1', 0));

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

ALTER FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMIT;
