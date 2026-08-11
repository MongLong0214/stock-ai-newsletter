-- Apply append-only membership history transitions atomically.

CREATE OR REPLACE FUNCTION public.apply_theme_stock_membership_history_diff(
  p_diff JSONB
)
RETURNS TABLE(opened INTEGER, closed INTEGER, appended INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_opens JSONB;
  v_transitions JSONB;
  v_open JSONB;
  v_transition JSONB;
  v_replacement JSONB;
  v_existing public.theme_stock_membership_history%ROWTYPE;
  v_close_id UUID;
  v_theme_id UUID;
  v_symbol TEXT;
  v_superseded_at TIMESTAMPTZ;
  v_updated INTEGER;
  v_opened INTEGER := 0;
  v_closed INTEGER := 0;
  v_appended INTEGER := 0;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  IF jsonb_typeof(p_diff) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'membership diff must be an object';
  END IF;

  v_opens := p_diff -> 'opens';
  v_transitions := p_diff -> 'transitions';
  IF jsonb_typeof(v_opens) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_transitions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'membership diff opens and transitions must be arrays';
  END IF;
  IF jsonb_array_length(v_opens) + jsonb_array_length(v_transitions) > 10000 THEN
    RAISE EXCEPTION 'membership diff exceeds 10000 operations';
  END IF;

  -- Lock and validate every expected open version. Any error rolls back all closes/appends.
  FOR v_transition IN SELECT value FROM jsonb_array_elements(v_transitions)
  LOOP
    IF jsonb_typeof(v_transition) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_transition -> 'replacements') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid membership transition shape';
    END IF;

    v_close_id := (v_transition ->> 'close_id')::UUID;
    v_theme_id := (v_transition ->> 'theme_id')::UUID;
    v_symbol := v_transition ->> 'symbol';
    v_superseded_at := (v_transition ->> 'superseded_at')::TIMESTAMPTZ;
    IF v_symbol IS NULL OR length(v_symbol) = 0 OR v_superseded_at IS NULL THEN
      RAISE EXCEPTION 'membership transition identity and close timestamp are required';
    END IF;

    SELECT history.* INTO v_existing
    FROM public.theme_stock_membership_history AS history
    WHERE history.id = v_close_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_existing.theme_id IS DISTINCT FROM v_theme_id
       OR v_existing.symbol IS DISTINCT FROM v_symbol
       OR v_existing.valid_to IS NOT NULL
       OR v_existing.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'membership transition target is stale or mismatched: %', v_close_id;
    END IF;

    UPDATE public.theme_stock_membership_history
    SET superseded_at = v_superseded_at
    WHERE id = v_close_id
      AND valid_to IS NULL
      AND superseded_at IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'membership transition close count mismatch: %', v_close_id;
    END IF;
    v_closed := v_closed + 1;

    FOR v_replacement IN SELECT value FROM jsonb_array_elements(v_transition -> 'replacements')
    LOOP
      IF jsonb_typeof(v_replacement) IS DISTINCT FROM 'object'
         OR (v_replacement ->> 'theme_id')::UUID IS DISTINCT FROM v_theme_id
         OR v_replacement ->> 'symbol' IS DISTINCT FROM v_symbol
         OR (v_replacement ->> 'recorded_at')::TIMESTAMPTZ IS DISTINCT FROM v_superseded_at
         OR v_replacement ->> 'source' IS DISTINCT FROM v_existing.source THEN
        RAISE EXCEPTION 'membership replacement does not match its transition';
      END IF;

      INSERT INTO public.theme_stock_membership_history (
        theme_id, symbol, valid_from, valid_to, recorded_at, source,
        collection_run_id, relevance, market
      ) VALUES (
        (v_replacement ->> 'theme_id')::UUID,
        v_replacement ->> 'symbol',
        (v_replacement ->> 'valid_from')::DATE,
        NULLIF(v_replacement ->> 'valid_to', '')::DATE,
        (v_replacement ->> 'recorded_at')::TIMESTAMPTZ,
        v_replacement ->> 'source',
        NULLIF(v_replacement ->> 'collection_run_id', '')::UUID,
        NULLIF(v_replacement ->> 'relevance', '')::NUMERIC,
        NULLIF(v_replacement ->> 'market', '')
      );
      v_appended := v_appended + 1;
    END LOOP;
  END LOOP;

  FOR v_open IN SELECT value FROM jsonb_array_elements(v_opens)
  LOOP
    IF jsonb_typeof(v_open) IS DISTINCT FROM 'object'
       OR COALESCE(v_open ->> 'symbol', '') = ''
       OR COALESCE(v_open ->> 'source', '') = ''
       OR NULLIF(v_open ->> 'valid_to', '') IS NOT NULL THEN
      RAISE EXCEPTION 'invalid open membership row';
    END IF;

    INSERT INTO public.theme_stock_membership_history (
      theme_id, symbol, valid_from, valid_to, recorded_at, source,
      collection_run_id, relevance, market
    ) VALUES (
      (v_open ->> 'theme_id')::UUID,
      v_open ->> 'symbol',
      (v_open ->> 'valid_from')::DATE,
      NULL,
      (v_open ->> 'recorded_at')::TIMESTAMPTZ,
      v_open ->> 'source',
      NULLIF(v_open ->> 'collection_run_id', '')::UUID,
      NULLIF(v_open ->> 'relevance', '')::NUMERIC,
      NULLIF(v_open ->> 'market', '')
    );
    v_opened := v_opened + 1;
    v_appended := v_appended + 1;
  END LOOP;

  RETURN QUERY SELECT v_opened, v_closed, v_appended;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_theme_stock_membership_history_diff(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_theme_stock_membership_history_diff(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.apply_theme_stock_membership_history_diff(JSONB) IS
  'Atomically validates expected open membership versions, closes them once, and appends replacement/new versions; service-role only.';
