BEGIN;

CREATE TABLE IF NOT EXISTS public.theme_predictions_v3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  horizon_days INT NOT NULL DEFAULT 5,
  serving_role TEXT NOT NULL DEFAULT 'champion'
    CHECK (serving_role IN ('champion','challenger','shadow')),
  p_rise NUMERIC CHECK (p_rise IS NULL OR (p_rise >= 0 AND p_rise <= 1)),
  ci_lower NUMERIC CHECK (ci_lower IS NULL OR (ci_lower >= 0 AND ci_lower <= 1)),
  ci_upper NUMERIC CHECK (ci_upper IS NULL OR (ci_upper >= 0 AND ci_upper <= 1)),
  abstain BOOLEAN NOT NULL DEFAULT false,
  abstain_reasons TEXT[],
  features JSONB NOT NULL,
  model_version TEXT NOT NULL,
  labeler_version TEXT NOT NULL,
  param_version TEXT NOT NULL,
  actual_g NUMERIC,
  actual_y BOOLEAN,
  scored_at TIMESTAMPTZ,
  score_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (score_status IN ('pending','scored','censored','excluded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (theme_id, prediction_date, horizon_days, model_version),
  CHECK (abstain OR p_rise IS NOT NULL),
  CHECK (ci_lower IS NULL OR ci_upper IS NULL OR ci_lower <= ci_upper)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_predictions_v3_champion
  ON public.theme_predictions_v3 (theme_id, prediction_date, horizon_days)
  WHERE serving_role = 'champion';

CREATE INDEX IF NOT EXISTS idx_predictions_v3_pending
  ON public.theme_predictions_v3 (score_status, prediction_date)
  WHERE score_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_predictions_v3_serving
  ON public.theme_predictions_v3 (prediction_date DESC, theme_id);

ALTER TABLE public.theme_predictions_v3 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_theme_predictions_v3 ON public.theme_predictions_v3;
CREATE POLICY service_role_all_theme_predictions_v3
  ON public.theme_predictions_v3
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.theme_predictions_v3 FROM anon, authenticated;

COMMENT ON TABLE public.theme_predictions_v3 IS
  'TLI v3 single prediction object: serving snapshot, shadow record, and future scoring target';
COMMENT ON COLUMN public.theme_predictions_v3.features IS
  'Point-in-time feature vector payload used to reproduce model inference and debug abstains';

COMMIT;
