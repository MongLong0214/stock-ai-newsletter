-- Constrain model registry dispatch and withhold stale public predictions.

DO $$
BEGIN
  -- The existing trigger requires owner authority plus a transaction-bound lifecycle marker.
  PERFORM set_config('tli.cycle_registry_rpc', 'migration-061-model-type-quarantine', true);

  UPDATE public.model_registry
  SET status = 'archived',
      scientific_claim_status = 'invalidated',
      scientific_release_status = 'blocked',
      scientific_claim_reason = 'unsupported_model_type',
      invalidated_at = COALESCE(invalidated_at, now())
  WHERE model_type NOT IN ('b_abl', 'm1_logistic');
END;
$$;

ALTER TABLE public.model_registry
  DROP CONSTRAINT IF EXISTS model_registry_supported_model_type_check;

ALTER TABLE public.model_registry
  ADD CONSTRAINT model_registry_supported_model_type_check
  CHECK (
    model_type IN ('b_abl', 'm1_logistic')
    OR (
      status = 'archived'
      AND scientific_claim_status = 'invalidated'
      AND scientific_release_status = 'blocked'
      AND scientific_claim_reason = 'unsupported_model_type'
      AND invalidated_at IS NOT NULL
    )
  );

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
    WHERE (p_theme_id IS NULL OR prediction.theme_id = p_theme_id)
      AND prediction.prediction_date >= CURRENT_DATE - 10
      AND prediction.prediction_date <= CURRENT_DATE
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

COMMENT ON CONSTRAINT model_registry_supported_model_type_check ON public.model_registry IS
  'Runtime dispatch is exhaustive: unsupported model types may exist only as invalidated, blocked archived quarantine records.';
COMMENT ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID) IS
  'Returns the optional-theme-scoped latest public cohort only when it is no more than 10 calendar days old.';
