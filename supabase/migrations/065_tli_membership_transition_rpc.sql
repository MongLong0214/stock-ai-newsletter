BEGIN;

-- Close and append each membership vintage in the same transaction; a close-only transition corrects same-day system time.
CREATE OR REPLACE FUNCTION public.apply_theme_stock_membership_transitions(p_transitions JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_transition_keys CONSTANT TEXT[] := ARRAY['themeId', 'symbol', 'close', 'replacements'];
  v_close_keys CONSTANT TEXT[] := ARRAY['id', 'superseded_at'];
  v_replacement_keys CONSTANT TEXT[] := ARRAY[
    'theme_id', 'symbol', 'valid_from', 'valid_to', 'recorded_at',
    'source', 'collection_run_id', 'relevance', 'market'
  ];
  v_transition JSONB;
  v_close JSONB;
  v_replacements JSONB;
  v_replacement JSONB;
  v_theme_id UUID;
  v_symbol TEXT;
  v_close_id UUID;
  v_close_at TIMESTAMPTZ;
  v_close_ids UUID[] := ARRAY[]::UUID[];
  v_affected_count INTEGER;
  v_closed_count INTEGER := 0;
  v_appended_count INTEGER := 0;
BEGIN
  IF p_transitions IS NULL OR jsonb_typeof(p_transitions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'membership transitions must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tli-membership-history-v1', 0));

  FOR v_transition IN SELECT value FROM jsonb_array_elements(p_transitions) AS item(value)
  LOOP
    IF jsonb_typeof(v_transition) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'membership transition must be an object'
        USING ERRCODE = '22023';
    END IF;
    IF public.tli_jsonb_object_key_count(v_transition) <> cardinality(v_transition_keys)
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_transition) AS input_key(key)
         WHERE NOT (input_key.key = ANY(v_transition_keys))
       )
       OR jsonb_typeof(v_transition -> 'themeId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_transition -> 'symbol') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_transition -> 'close') IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_transition -> 'replacements') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'membership transition has unknown, missing, or invalid fields'
        USING ERRCODE = '22023';
    END IF;

    v_close := v_transition -> 'close';
    v_replacements := v_transition -> 'replacements';
    IF public.tli_jsonb_object_key_count(v_close) <> cardinality(v_close_keys)
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_close) AS input_key(key)
         WHERE NOT (input_key.key = ANY(v_close_keys))
       )
       OR jsonb_typeof(v_close -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_close -> 'superseded_at') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION 'membership close has unknown, missing, or invalid fields'
        USING ERRCODE = '22023';
    END IF;
    v_theme_id := (v_transition ->> 'themeId')::UUID;
    v_symbol := v_transition ->> 'symbol';
    v_close_id := (v_close ->> 'id')::UUID;
    v_close_at := (v_close ->> 'superseded_at')::TIMESTAMPTZ;
    IF v_close_id = ANY(v_close_ids) THEN
      RAISE EXCEPTION 'membership close id % is duplicated', v_close_id
        USING ERRCODE = '22023';
    END IF;
    v_close_ids := array_append(v_close_ids, v_close_id);

    FOR v_replacement IN SELECT value FROM jsonb_array_elements(v_replacements) AS item(value)
    LOOP
      IF jsonb_typeof(v_replacement) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'membership replacement for close id % must be an object', v_close_id
          USING ERRCODE = '22023';
      END IF;
      IF public.tli_jsonb_object_key_count(v_replacement) <> cardinality(v_replacement_keys)
         OR EXISTS (
           SELECT 1 FROM jsonb_object_keys(v_replacement) AS input_key(key)
           WHERE NOT (input_key.key = ANY(v_replacement_keys))
         )
         OR jsonb_typeof(v_replacement -> 'theme_id') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_replacement -> 'symbol') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_replacement -> 'valid_from') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_replacement -> 'valid_to') NOT IN ('string', 'null')
         OR jsonb_typeof(v_replacement -> 'recorded_at') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_replacement -> 'source') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_replacement -> 'collection_run_id') NOT IN ('string', 'null')
         OR jsonb_typeof(v_replacement -> 'relevance') NOT IN ('number', 'null')
         OR jsonb_typeof(v_replacement -> 'market') NOT IN ('string', 'null')
      THEN
        RAISE EXCEPTION 'membership replacement for close id % has unknown, missing, or invalid fields', v_close_id
          USING ERRCODE = '22023';
      END IF;
      IF (v_replacement ->> 'theme_id')::UUID IS DISTINCT FROM v_theme_id
         OR v_replacement ->> 'symbol' IS DISTINCT FROM v_symbol
         OR (v_replacement ->> 'recorded_at')::TIMESTAMPTZ IS DISTINCT FROM v_close_at
      THEN
        RAISE EXCEPTION 'membership replacement for close id % must match themeId, symbol, and close superseded_at', v_close_id
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    UPDATE public.theme_stock_membership_history
    SET superseded_at = v_close_at
    WHERE id = v_close_id
      AND superseded_at IS NULL
      AND theme_id = v_theme_id
      AND symbol = v_symbol;
    GET DIAGNOSTICS v_affected_count = ROW_COUNT;
    IF v_affected_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'membership close id % affected % rows, expected 1', v_close_id, v_affected_count
        USING ERRCODE = '55000';
    END IF;
    v_closed_count := v_closed_count + 1;

    INSERT INTO public.theme_stock_membership_history (
      theme_id, symbol, valid_from, valid_to, recorded_at,
      source, collection_run_id, relevance, market
    )
    SELECT
      replacement.theme_id, replacement.symbol, replacement.valid_from, replacement.valid_to,
      replacement.recorded_at, replacement.source, replacement.collection_run_id,
      replacement.relevance, replacement.market
    FROM jsonb_to_recordset(v_replacements) AS replacement(
      theme_id UUID, symbol VARCHAR(20), valid_from DATE, valid_to DATE,
      recorded_at TIMESTAMPTZ, source VARCHAR(20), collection_run_id UUID,
      relevance NUMERIC(3,2), market VARCHAR(10)
    );
    GET DIAGNOSTICS v_affected_count = ROW_COUNT;
    IF v_affected_count IS DISTINCT FROM jsonb_array_length(v_replacements) THEN
      RAISE EXCEPTION 'membership close id % appended % of % replacements',
        v_close_id, v_affected_count, jsonb_array_length(v_replacements)
        USING ERRCODE = '55000';
    END IF;
    v_appended_count := v_appended_count + v_affected_count;
  END LOOP;

  RETURN jsonb_build_object('closed', v_closed_count, 'appended', v_appended_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_theme_stock_membership_transitions(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_theme_stock_membership_transitions(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.apply_theme_stock_membership_transitions(JSONB) IS
  'Atomically closes membership versions and appends replacements to prevent orphaned history.';

COMMIT;
