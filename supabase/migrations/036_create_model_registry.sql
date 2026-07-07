BEGIN;

CREATE TABLE IF NOT EXISTS public.model_registry (
  model_version TEXT PRIMARY KEY,
  model_type TEXT NOT NULL,
  coefficients JSONB NOT NULL,
  train_range DATERANGE NOT NULL,
  val_metrics JSONB NOT NULL,
  gate_result JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('champion', 'challenger', 'rolled_back', 'archived')),
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_champion
  ON public.model_registry (status)
  WHERE status = 'champion';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_challenger
  ON public.model_registry (status)
  WHERE status = 'challenger';

CREATE TABLE IF NOT EXISTS public.model_metrics_daily (
  metric_date DATE NOT NULL,
  model_version TEXT NOT NULL REFERENCES public.model_registry(model_version),
  brier NUMERIC CHECK (brier IS NULL OR brier >= 0),
  ece NUMERIC CHECK (ece IS NULL OR (ece >= 0 AND ece <= 1)),
  ic NUMERIC CHECK (ic IS NULL OR (ic >= -1 AND ic <= 1)),
  p_at_10 NUMERIC CHECK (p_at_10 IS NULL OR (p_at_10 >= 0 AND p_at_10 <= 1)),
  coverage NUMERIC CHECK (coverage IS NULL OR (coverage >= 0 AND coverage <= 1)),
  abstain_rate NUMERIC CHECK (abstain_rate IS NULL OR (abstain_rate >= 0 AND abstain_rate <= 1)),
  n_scored INT NOT NULL CHECK (n_scored >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_model_metrics_daily_model_date
  ON public.model_metrics_daily (model_version, metric_date DESC);

ALTER TABLE public.model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_model_registry ON public.model_registry;
CREATE POLICY service_role_all_model_registry
  ON public.model_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_model_metrics_daily ON public.model_metrics_daily;
CREATE POLICY service_role_all_model_metrics_daily
  ON public.model_metrics_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.model_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.model_metrics_daily FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.promote_model_registry_version(p_model_version TEXT)
RETURNS TABLE (
  model_version TEXT,
  status TEXT,
  promoted_at TIMESTAMPTZ,
  previous_champion TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_champion TEXT;
BEGIN
  SELECT mr.model_version
  INTO v_previous_champion
  FROM public.model_registry mr
  WHERE mr.status = 'champion'
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry mr
    WHERE mr.model_version = p_model_version
      AND mr.status = 'challenger'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'model version % is not an active challenger', p_model_version;
  END IF;

  UPDATE public.model_registry
  SET status = 'archived'
  WHERE public.model_registry.status = 'champion'
    AND model_registry.model_version <> p_model_version;

  UPDATE public.model_registry
  SET status = 'champion',
      promoted_at = now()
  WHERE model_registry.model_version = p_model_version;

  RETURN QUERY
  SELECT mr.model_version, mr.status, mr.promoted_at, v_previous_champion
  FROM public.model_registry mr
  WHERE mr.model_version = p_model_version;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_model_registry_version(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_model_registry_version(TEXT) TO service_role;

INSERT INTO public.model_registry (
  model_version,
  model_type,
  coefficients,
  train_range,
  val_metrics,
  gate_result,
  status,
  promoted_at
)
SELECT
  'b-abl-v1',
  'b_abl',
  jsonb_build_object(
    'artifact_version', 'tli-baseline-artifact-v1',
    'model_type', 'b_abl',
    'rule', 'prediction_snapshots_v2.phase rising maps to y=true',
    'source', 'T-206 No-Go fallback'
  ),
  daterange('2026-06-01'::date, '2026-06-25'::date, '[)'),
  jsonb_build_object(
    'brier', 0.1765,
    'source', 'docs/tli-v3-go-no-go-2026-07-06.md',
    'n_nonoverlap', 4
  ),
  jsonb_build_object(
    'decision', 'seed_baseline_champion_after_no_go',
    'source_ticket', 'T-301'
  ),
  'champion',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.model_registry WHERE status = 'champion'
)
ON CONFLICT (model_version) DO NOTHING;

COMMENT ON TABLE public.model_registry IS
  'TLI v3 model artifact SSOT and champion/challenger promotion history';
COMMENT ON TABLE public.model_metrics_daily IS
  'TLI v3 daily model monitoring metrics used by rollback and methodology publishing';

COMMIT;
