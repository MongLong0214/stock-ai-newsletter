BEGIN;

CREATE OR REPLACE FUNCTION public.reject_tli_theme_labels_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user IS DISTINCT FROM pg_get_userbyid((
       SELECT function_row.proowner
       FROM pg_proc AS function_row
       WHERE function_row.oid = 'public.reject_tli_theme_labels_truncate()'::REGPROCEDURE
     ))
     OR current_setting('tli.theme_labels_truncate_xid', true)
       IS DISTINCT FROM pg_current_xact_id()::text
  THEN
    RAISE EXCEPTION 'theme_labels TRUNCATE requires the function owner and transaction-bound guard'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER guard_tli_theme_labels_truncate
  BEFORE TRUNCATE ON public.theme_labels
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_theme_labels_truncate();

REVOKE TRUNCATE ON TABLE public.theme_labels FROM service_role;
REVOKE EXECUTE ON FUNCTION public.reject_tli_theme_labels_truncate()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_theme_labels_forecast_origin_base_date_id
  ON public.theme_labels (forecast_origin_manifest_id, base_date, id);

CREATE OR REPLACE FUNCTION public.load_tli_latest_public_scientific_predictions_v3(
  p_theme_id UUID DEFAULT NULL
)
RETURNS TABLE (
  theme_id UUID,
  prediction_date DATE,
  p_rise NUMERIC,
  ci_lower NUMERIC,
  ci_upper NUMERIC,
  abstain BOOLEAN,
  abstain_reasons TEXT[],
  model_version TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  WITH scoped_predictions AS MATERIALIZED (
    SELECT
      prediction.theme_id,
      prediction.prediction_date,
      prediction.p_rise,
      prediction.ci_lower,
      prediction.ci_upper,
      prediction.abstain,
      prediction.abstain_reasons,
      prediction.model_version
    FROM public.tli_public_scientific_predictions_v3 AS prediction
    WHERE p_theme_id IS NULL OR prediction.theme_id = p_theme_id
  )
  SELECT
    prediction.theme_id,
    prediction.prediction_date,
    prediction.p_rise,
    prediction.ci_lower,
    prediction.ci_upper,
    prediction.abstain,
    prediction.abstain_reasons,
    prediction.model_version
  FROM scoped_predictions AS prediction
  WHERE prediction.prediction_date = (
    SELECT max(candidate.prediction_date)
    FROM scoped_predictions AS candidate
  );
$$;

REVOKE EXECUTE ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID)
  TO service_role;

COMMENT ON FUNCTION public.reject_tli_theme_labels_truncate() IS
  'Rejects direct and cascaded TRUNCATE unless both function-owner authority and a transaction-bound GUC are present.';
COMMENT ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID) IS
  'Returns the optional-theme-scoped latest public scientific cohort from one statement snapshot.';

COMMIT;
