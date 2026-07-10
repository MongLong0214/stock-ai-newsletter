BEGIN;

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
  IF TG_TABLE_NAME = 'tli_collection_runs' THEN
    v_run_id := NEW.id;
  ELSIF TG_TABLE_NAME IN ('tli_interest_observations', 'tli_news_observations', 'tli_babl_phase_observations') THEN
    v_run_id := NEW.collection_run_id;
  END IF;

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

COMMIT;
