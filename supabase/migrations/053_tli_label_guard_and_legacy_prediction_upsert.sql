BEGIN;

-- F2 P1: gta-v2 terminal labels are produced only by the canonical finalizer.
-- Direct inserts may create a pristine pending row, but cannot preload outcomes or provenance.
CREATE OR REPLACE FUNCTION public.enforce_tli_gta_v2_label_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.labeler_version = 'gta-v2' THEN
    IF NEW.label_type <> 'gt_a' OR NEW.horizon_days <> 5 THEN
      RAISE EXCEPTION 'gta-v2 labels must be gt_a with a 5-day horizon'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.label_status IS DISTINCT FROM 'pending'
       OR NEW.scientific_use_status IS DISTINCT FROM 'exploratory_only'
       OR NEW.scientific_use_reason IS DISTINCT FROM 'pending_gta_v2'
       OR NEW.rescale_suspect IS DISTINCT FROM FALSE
       OR NEW.low_signal IS DISTINCT FROM FALSE
       OR NEW.keyword_epoch IS DISTINCT FROM 1
       OR NEW.g_log_ratio IS NOT NULL
       OR NEW.y_binary IS NOT NULL
       OR NEW.denominator IS NOT NULL
       OR NEW.basket_excess_return IS NOT NULL
       OR NEW.basket_size IS NOT NULL
       OR NEW.exclude_reason IS NOT NULL
       OR NEW.finalized_at IS NOT NULL
       OR NEW.forecast_interest_run_id IS NOT NULL
       OR NEW.label_source_run_id IS NOT NULL
       OR NEW.source_cutoff IS NOT NULL
       OR NEW.source_max_date IS NOT NULL
       OR NEW.label_request_sha256 IS NOT NULL
       OR NEW.label_response_sha256 IS NOT NULL
       OR NEW.past_dates IS NOT NULL
       OR NEW.future_dates IS NOT NULL
       OR NEW.past_observation_count IS NOT NULL
       OR NEW.future_observation_count IS NOT NULL
       OR NEW.forecast_keyword_group_sha256 IS NOT NULL
    THEN
      RAISE EXCEPTION 'gta-v2 inserts must be pristine pending labels finalized only by finalize_tli_gta_v2_label'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.forecast_origin_manifest_id IS NULL THEN
      RAISE EXCEPTION 'gta-v2 labels require a forecast origin manifest'
        USING ERRCODE = '22023';
    END IF;
    PERFORM 1
    FROM public.tli_forecast_origin_manifests AS manifest
    JOIN public.tli_forecast_origin_theme_inputs AS child
      ON child.forecast_origin_manifest_id = manifest.id
    WHERE manifest.id = NEW.forecast_origin_manifest_id
      AND manifest.origin_date = NEW.base_date
      AND child.theme_id = NEW.theme_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gta-v2 label needs a forecast manifest whose origin_date equals base_date with a matching theme child'
        USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.forecast_origin_manifest_id IS NOT NULL
     OR NEW.forecast_interest_run_id IS NOT NULL
     OR NEW.label_source_run_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'legacy labels must leave gta-v2 provenance foreign keys null'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- The GUC is only a row binding token. Authority comes from executing inside the
-- SECURITY DEFINER finalizer owned by the role recorded in pg_proc.
CREATE OR REPLACE FUNCTION public.guard_tli_gta_v2_label_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.labeler_version = 'gta-v2' THEN
      RAISE EXCEPTION 'gta-v2 labels are permanent and cannot be deleted'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.labeler_version <> 'gta-v2' AND NEW.labeler_version <> 'gta-v2' THEN
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM pg_get_userbyid((
       SELECT function_row.proowner
       FROM pg_proc AS function_row
       WHERE function_row.oid = 'public.finalize_tli_gta_v2_label(text,text)'::REGPROCEDURE
     ))
     OR current_setting('tli.finalize_gta_v2_label_id', true) IS DISTINCT FROM OLD.id::text
  THEN
    RAISE EXCEPTION 'gta-v2 labels transition only through finalize_tli_gta_v2_label'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.label_status <> 'pending' THEN
    RAISE EXCEPTION 'gta-v2 terminal labels cannot be re-adjudicated'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.label_status NOT IN ('final','excluded') THEN
    RAISE EXCEPTION 'gta-v2 pending labels transition only to final or excluded'
      USING ERRCODE = '22023';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.theme_id IS DISTINCT FROM OLD.theme_id
     OR NEW.base_date IS DISTINCT FROM OLD.base_date
     OR NEW.label_type IS DISTINCT FROM OLD.label_type
     OR NEW.horizon_days IS DISTINCT FROM OLD.horizon_days
     OR NEW.labeler_version IS DISTINCT FROM OLD.labeler_version
     OR NEW.forecast_origin_manifest_id IS DISTINCT FROM OLD.forecast_origin_manifest_id
  THEN
    RAISE EXCEPTION 'gta-v2 identity and forecast origin are immutable across finalization'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tli_legacy_predictions_v3(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_allowed_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'prediction_date',
    'horizon_days',
    'serving_role',
    'p_rise',
    'ci_lower',
    'ci_upper',
    'abstain',
    'abstain_reasons',
    'features',
    'model_version',
    'labeler_version',
    'param_version',
    'score_status'
  ];
  v_requested_count INTEGER;
  v_affected_count INTEGER;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'legacy prediction rows must be a JSON array'
      USING ERRCODE = '22023';
  END IF;
  v_requested_count := jsonb_array_length(p_rows);
  IF v_requested_count = 0 THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS input_row(value)
    WHERE jsonb_typeof(input_row.value) IS DISTINCT FROM 'object'
       OR public.tli_jsonb_object_key_count(input_row.value) <> cardinality(v_allowed_keys)
       OR EXISTS (
         SELECT 1
         FROM jsonb_object_keys(input_row.value) AS input_key(key)
         WHERE NOT (input_key.key = ANY(v_allowed_keys))
       )
       OR jsonb_typeof(input_row.value -> 'theme_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'prediction_date') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'horizon_days') IS DISTINCT FROM 'number'
       OR jsonb_typeof(input_row.value -> 'serving_role') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'p_rise') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'ci_lower') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'ci_upper') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'abstain') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(input_row.value -> 'abstain_reasons') IS DISTINCT FROM 'array'
       OR jsonb_typeof(input_row.value -> 'features') IS DISTINCT FROM 'object'
       OR jsonb_typeof(input_row.value -> 'model_version') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'labeler_version') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'param_version') IS DISTINCT FROM 'string'
       OR input_row.value ->> 'score_status' IS DISTINCT FROM 'pending'
  ) THEN
    RAISE EXCEPTION 'legacy prediction row has unknown, missing, terminal, or malformed fields'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.theme_predictions_v3 AS prediction (
    theme_id,
    prediction_date,
    horizon_days,
    serving_role,
    p_rise,
    ci_lower,
    ci_upper,
    abstain,
    abstain_reasons,
    features,
    model_version,
    labeler_version,
    param_version,
    score_status
  )
  SELECT
    input_row.theme_id,
    input_row.prediction_date,
    input_row.horizon_days,
    input_row.serving_role,
    input_row.p_rise,
    input_row.ci_lower,
    input_row.ci_upper,
    input_row.abstain,
    input_row.abstain_reasons,
    input_row.features,
    input_row.model_version,
    input_row.labeler_version,
    input_row.param_version,
    input_row.score_status
  FROM jsonb_to_recordset(p_rows) AS input_row(
    theme_id UUID,
    prediction_date DATE,
    horizon_days INTEGER,
    serving_role TEXT,
    p_rise NUMERIC,
    ci_lower NUMERIC,
    ci_upper NUMERIC,
    abstain BOOLEAN,
    abstain_reasons TEXT[],
    features JSONB,
    model_version TEXT,
    labeler_version TEXT,
    param_version TEXT,
    score_status TEXT
  )
  ON CONFLICT (theme_id, prediction_date, horizon_days, model_version)
    WHERE experiment_cycle_id IS NULL
  DO UPDATE SET
    serving_role = EXCLUDED.serving_role,
    p_rise = EXCLUDED.p_rise,
    ci_lower = EXCLUDED.ci_lower,
    ci_upper = EXCLUDED.ci_upper,
    abstain = EXCLUDED.abstain,
    abstain_reasons = EXCLUDED.abstain_reasons,
    features = EXCLUDED.features,
    labeler_version = EXCLUDED.labeler_version,
    param_version = EXCLUDED.param_version,
    score_status = EXCLUDED.score_status
  WHERE prediction.experiment_cycle_id IS NULL
    AND prediction.score_status = 'pending';

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  IF v_affected_count IS DISTINCT FROM v_requested_count THEN
    RAISE EXCEPTION 'legacy prediction upsert affected % of % rows',
      v_affected_count, v_requested_count
      USING ERRCODE = '55000';
  END IF;
  RETURN v_affected_count;
END;
$$;

REVOKE UPDATE ON TABLE public.theme_labels FROM service_role;
REVOKE UPDATE (
  id,
  created_at,
  scientific_use_status,
  scientific_use_reason,
  past_dates,
  future_dates,
  forecast_origin_manifest_id,
  forecast_interest_run_id,
  label_source_run_id,
  source_cutoff,
  source_max_date,
  label_request_sha256,
  label_response_sha256,
  past_observation_count,
  future_observation_count,
  forecast_keyword_group_sha256
) ON TABLE public.theme_labels FROM service_role;
GRANT UPDATE (
  theme_id,
  base_date,
  label_type,
  horizon_days,
  g_log_ratio,
  y_binary,
  denominator,
  rescale_suspect,
  low_signal,
  keyword_epoch,
  basket_excess_return,
  basket_size,
  label_status,
  exclude_reason,
  labeler_version,
  finalized_at
) ON TABLE public.theme_labels TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_tli_gta_v2_label_provenance()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_tli_gta_v2_label_transition()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_tli_legacy_predictions_v3(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tli_legacy_predictions_v3(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.enforce_tli_gta_v2_label_provenance() IS
  'Allows only pristine pending gta-v2 inserts with a matching frozen forecast origin.';
COMMENT ON FUNCTION public.guard_tli_gta_v2_label_transition() IS
  'Requires both the canonical finalizer owner and its row-scoped GUC for gta-v2 mutation.';

COMMIT;
