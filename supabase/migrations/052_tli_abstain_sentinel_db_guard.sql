BEGIN;

CREATE OR REPLACE FUNCTION public.tli_assert_scientific_prediction_sentinel(
  p_abstain BOOLEAN,
  p_p_rise NUMERIC,
  p_ci_lower NUMERIC,
  p_ci_upper NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_abstain IS TRUE THEN
    IF p_p_rise IS NOT NULL
       OR p_ci_lower IS NOT NULL
       OR p_ci_upper IS NOT NULL
    THEN
      RAISE EXCEPTION 'scientific abstain prediction requires the all-null probability and interval sentinel'
        USING ERRCODE = '23514';
    END IF;
  ELSIF p_abstain IS FALSE THEN
    IF p_p_rise IS NULL
       OR p_ci_lower IS NULL
       OR p_ci_upper IS NULL
       OR NOT (
         0 <= p_ci_lower
         AND p_ci_lower <= p_p_rise
         AND p_p_rise <= p_ci_upper
         AND p_ci_upper <= 1
       )
    THEN
      RAISE EXCEPTION 'scientific non-abstain prediction requires an ordered probability and interval in [0,1]'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'scientific prediction abstain flag is required'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_tli_scientific_prediction_sentinel_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.experiment_cycle_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.tli_assert_scientific_prediction_sentinel(
    NEW.abstain,
    NEW.p_rise,
    NEW.ci_lower,
    NEW.ci_upper
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_tli_scientific_prediction_sentinel_insert
  BEFORE INSERT ON public.theme_predictions_v3
  FOR EACH ROW EXECUTE FUNCTION public.validate_tli_scientific_prediction_sentinel_insert();

CREATE OR REPLACE FUNCTION public.finalize_tli_scientific_prediction_score(
  p_score_canonical_json TEXT,
  p_score_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_prediction public.theme_predictions_v3%ROWTYPE;
  v_origin public.tli_experiment_origin_manifests%ROWTYPE;
  v_label public.theme_labels%ROWTYPE;
  v_prediction_id UUID;
  v_label_id UUID;
  v_score_status TEXT;
  v_exclusion_reason TEXT;
  v_scored_at TIMESTAMPTZ;
BEGIN
  v_payload := public.tli_require_canonical_json_v1(
    p_score_canonical_json,
    p_score_payload_sha256
  );

  IF public.tli_jsonb_object_key_count(v_payload) <> 5
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE payload_key.key NOT IN (
         'prediction_id','actual_label_id','score_status','score_exclusion_reason','scored_at'
       )
     )
  THEN
    RAISE EXCEPTION 'scientific score payload has unknown or missing fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_prediction_id := (v_payload ->> 'prediction_id')::UUID;
    v_label_id := (v_payload ->> 'actual_label_id')::UUID;
    v_score_status := v_payload ->> 'score_status';
    v_exclusion_reason := v_payload ->> 'score_exclusion_reason';
    v_scored_at := (v_payload ->> 'scored_at')::TIMESTAMPTZ;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'scientific score payload contains malformed typed values'
      USING ERRCODE = '22023';
  END;

  IF v_payload ->> 'prediction_id' IS DISTINCT FROM v_prediction_id::text
     OR v_payload ->> 'actual_label_id' IS DISTINCT FROM v_label_id::text
     OR v_score_status NOT IN ('scored','excluded')
     OR v_scored_at IS NULL
     OR NOT isfinite(v_scored_at)
     OR v_payload ->> 'scored_at' IS DISTINCT FROM to_char(
       v_scored_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
     )
  THEN
    RAISE EXCEPTION 'scientific score identity and terminal status must be canonical'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prediction
  FROM public.theme_predictions_v3
  WHERE id = v_prediction_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_prediction.experiment_cycle_id IS NULL
     OR v_prediction.experiment_origin_manifest_id IS NULL
     OR v_prediction.scientific_prediction_role IS NULL
     OR v_prediction.score_status <> 'pending'
  THEN
    RAISE EXCEPTION 'scientific prediction is missing, legacy, or already terminal'
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.tli_assert_scientific_prediction_sentinel(
    v_prediction.abstain,
    v_prediction.p_rise,
    v_prediction.ci_lower,
    v_prediction.ci_upper
  );

  SELECT * INTO v_origin
  FROM public.tli_experiment_origin_manifests
  WHERE id = v_prediction.experiment_origin_manifest_id
    AND cycle_id = v_prediction.experiment_cycle_id;
  SELECT * INTO v_label
  FROM public.theme_labels
  WHERE id = v_label_id
    AND labeler_version = 'gta-v2'
  FOR UPDATE;

  IF v_origin.id IS NULL
     OR v_label.id IS NULL
     OR v_label.theme_id IS DISTINCT FROM v_prediction.theme_id
     OR v_label.base_date IS DISTINCT FROM v_prediction.prediction_date
     OR v_label.horizon_days IS DISTINCT FROM v_prediction.horizon_days
     OR v_label.labeler_version IS DISTINCT FROM v_prediction.labeler_version
     OR v_label.labeler_version <> 'gta-v2'
     OR v_label.label_type <> 'gt_a'
     OR v_label.forecast_origin_manifest_id IS DISTINCT FROM v_origin.forecast_origin_manifest_id
     OR NOT EXISTS (
       SELECT 1
       FROM public.theme_predictions_v3 AS counterpart
       WHERE counterpart.experiment_cycle_id = v_prediction.experiment_cycle_id
         AND counterpart.experiment_origin_manifest_id = v_prediction.experiment_origin_manifest_id
         AND counterpart.theme_id = v_prediction.theme_id
         AND counterpart.prediction_date = v_prediction.prediction_date
         AND counterpart.horizon_days = v_prediction.horizon_days
         AND counterpart.labeler_version = v_prediction.labeler_version
         AND counterpart.scientific_prediction_role = CASE
           WHEN v_prediction.scientific_prediction_role = 'candidate' THEN 'comparator'
           ELSE 'candidate'
         END
     )
  THEN
    RAISE EXCEPTION 'prediction foundation does not match the exact label foundation'
      USING ERRCODE = '23503';
  END IF;

  IF v_label.finalized_at IS NULL
     OR v_scored_at < v_label.finalized_at
     OR v_scored_at > clock_timestamp()
  THEN
    RAISE EXCEPTION 'scientific scoring time must be after exact label finalization and not in the future'
      USING ERRCODE = '22023';
  END IF;

  IF v_score_status = 'scored' THEN
    IF v_label.label_status <> 'final'
       OR v_label.scientific_use_status <> 'confirmatory_eligible'
       OR v_label.g_log_ratio IS NULL
       OR v_label.g_log_ratio::text IN ('NaN','Infinity','-Infinity')
       OR v_label.y_binary IS NULL
       OR v_exclusion_reason IS NOT NULL
    THEN
      RAISE EXCEPTION 'scored scientific prediction requires an exact final gta-v2 label'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_label.label_status <> 'excluded'
       OR v_label.exclude_reason IS NULL
       OR v_exclusion_reason IS DISTINCT FROM v_label.exclude_reason
    THEN
      RAISE EXCEPTION 'excluded scientific prediction requires the exact terminal excluded label reason'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('tli.finalize_scientific_prediction_id', v_prediction_id::text, true);
  UPDATE public.theme_predictions_v3
  SET score_status = v_score_status,
      actual_g = CASE WHEN v_score_status = 'scored' THEN v_label.g_log_ratio ELSE NULL END,
      actual_y = CASE WHEN v_score_status = 'scored' THEN v_label.y_binary ELSE NULL END,
      actual_label_id = v_label.id,
      score_payload_sha256 = p_score_payload_sha256,
      score_exclusion_reason = CASE WHEN v_score_status = 'excluded' THEN v_exclusion_reason ELSE NULL END,
      scored_at = v_scored_at
  WHERE id = v_prediction_id;

  RETURN v_prediction_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tli_assert_scientific_prediction_sentinel(BOOLEAN, NUMERIC, NUMERIC, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tli_assert_scientific_prediction_sentinel(BOOLEAN, NUMERIC, NUMERIC, NUMERIC)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.validate_tli_scientific_prediction_sentinel_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT)
  TO service_role;

COMMIT;
