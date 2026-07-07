BEGIN;

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
    AND public.model_registry.model_version <> p_model_version;

  UPDATE public.model_registry
  SET status = 'champion',
      promoted_at = now()
  WHERE public.model_registry.model_version = p_model_version;

  RETURN QUERY
  SELECT mr.model_version, mr.status, mr.promoted_at, v_previous_champion
  FROM public.model_registry mr
  WHERE mr.model_version = p_model_version;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_model_registry_version(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_model_registry_version(TEXT) TO service_role;

COMMIT;
