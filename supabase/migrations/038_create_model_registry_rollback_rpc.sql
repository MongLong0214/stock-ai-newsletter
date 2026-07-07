BEGIN;

CREATE OR REPLACE FUNCTION public.rollback_model_registry_version(p_target_model_version TEXT)
RETURNS TABLE (
  model_version TEXT,
  status TEXT,
  promoted_at TIMESTAMPTZ,
  rolled_back_model_version TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_champion TEXT;
BEGIN
  SELECT mr.model_version
  INTO v_current_champion
  FROM public.model_registry mr
  WHERE mr.status = 'champion'
  FOR UPDATE;

  IF v_current_champion IS NULL THEN
    RAISE EXCEPTION 'no champion model is active';
  END IF;

  IF p_target_model_version = v_current_champion THEN
    RAISE EXCEPTION 'target model % is already champion', p_target_model_version;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.model_registry mr
    WHERE mr.model_version = p_target_model_version
      AND mr.status IN ('archived', 'rolled_back')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'rollback target % is not an archived or rolled_back model', p_target_model_version;
  END IF;

  UPDATE public.model_registry
  SET status = 'rolled_back'
  WHERE public.model_registry.model_version = v_current_champion;

  UPDATE public.model_registry
  SET status = 'champion',
      promoted_at = now()
  WHERE public.model_registry.model_version = p_target_model_version;

  RETURN QUERY
  SELECT mr.model_version, mr.status, mr.promoted_at, v_current_champion
  FROM public.model_registry mr
  WHERE mr.model_version = p_target_model_version;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_model_registry_version(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_model_registry_version(TEXT) TO service_role;

COMMIT;
