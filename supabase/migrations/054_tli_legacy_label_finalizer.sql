BEGIN;

-- 048의 versioned identity 이후 legacy finalization을 INSERT/UPSERT가 아닌 exact pending UPDATE로 고정한다.
-- gta-v2는 기존 canonical finalizer만 사용하며 이 함수는 gta-v1/gtb-v1 외 버전을 거부한다.
CREATE OR REPLACE FUNCTION public.finalize_tli_legacy_labels(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_allowed_keys CONSTANT TEXT[] := ARRAY[
    'id',
    'theme_id',
    'base_date',
    'label_type',
    'horizon_days',
    'labeler_version',
    'g_log_ratio',
    'y_binary',
    'denominator',
    'rescale_suspect',
    'low_signal',
    'keyword_epoch',
    'basket_excess_return',
    'basket_size',
    'label_status',
    'exclude_reason'
  ];
  v_requested_count INTEGER;
  v_affected_count INTEGER;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'legacy label finalizer rows must be a JSON array'
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
       OR jsonb_typeof(input_row.value -> 'id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'theme_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'base_date') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'label_type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'horizon_days') IS DISTINCT FROM 'number'
       OR jsonb_typeof(input_row.value -> 'labeler_version') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'g_log_ratio') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'y_binary') NOT IN ('boolean','null')
       OR jsonb_typeof(input_row.value -> 'denominator') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'rescale_suspect') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(input_row.value -> 'low_signal') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(input_row.value -> 'keyword_epoch') IS DISTINCT FROM 'number'
       OR jsonb_typeof(input_row.value -> 'basket_excess_return') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'basket_size') NOT IN ('number','null')
       OR jsonb_typeof(input_row.value -> 'label_status') IS DISTINCT FROM 'string'
       OR jsonb_typeof(input_row.value -> 'exclude_reason') NOT IN ('string','null')
  ) THEN
    RAISE EXCEPTION 'legacy label finalizer row has unknown or missing fields'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS input_row(
      id UUID,
      theme_id UUID,
      base_date DATE,
      label_type TEXT,
      horizon_days INTEGER,
      labeler_version TEXT,
      g_log_ratio NUMERIC,
      y_binary BOOLEAN,
      denominator NUMERIC,
      rescale_suspect BOOLEAN,
      low_signal BOOLEAN,
      keyword_epoch INTEGER,
      basket_excess_return NUMERIC,
      basket_size INTEGER,
      label_status TEXT,
      exclude_reason TEXT
    )
    WHERE input_row.id IS NULL
       OR input_row.theme_id IS NULL
       OR input_row.base_date IS NULL
       OR input_row.horizon_days IS DISTINCT FROM 5
       OR input_row.rescale_suspect IS NULL
       OR input_row.low_signal IS NULL
       OR input_row.keyword_epoch IS NULL
       OR (
         NOT (
           input_row.label_type = 'gt_a'
           AND input_row.labeler_version = 'gta-v1'
           AND input_row.label_status IN ('final', 'censored', 'excluded')
           AND input_row.keyword_epoch > 0
           AND input_row.basket_excess_return IS NULL
           AND input_row.basket_size IS NULL
         )
         AND NOT (
           input_row.label_type = 'gt_b'
           AND input_row.labeler_version = 'gtb-v1'
           AND input_row.label_status IN ('final', 'excluded')
           AND input_row.g_log_ratio IS NULL
           AND input_row.y_binary IS NULL
           AND input_row.denominator IS NULL
           AND input_row.rescale_suspect = FALSE
           AND input_row.low_signal = FALSE
           AND input_row.keyword_epoch = 1
           AND input_row.basket_size IS NOT NULL
           AND input_row.basket_size >= 0
         )
       )
       OR (
         input_row.label_status = 'final'
         AND input_row.label_type = 'gt_a'
         AND (input_row.g_log_ratio IS NULL OR input_row.y_binary IS NULL)
       )
       OR (
         input_row.label_status <> 'final'
         AND input_row.label_type = 'gt_a'
         AND (input_row.g_log_ratio IS NOT NULL OR input_row.y_binary IS NOT NULL)
       )
       OR (
         input_row.label_status = 'final'
         AND input_row.label_type = 'gt_b'
         AND (input_row.basket_excess_return IS NULL OR input_row.basket_size IS NULL)
       )
       OR (
         input_row.label_type = 'gt_a'
         AND input_row.label_status = 'excluded'
         AND (
           input_row.exclude_reason IS NULL
           OR input_row.exclude_reason NOT IN (
             'insufficient_days',
             'denominator_floor',
             'keyword_epoch_break',
             'non_trading_base_date'
           )
         )
       )
       OR (
         input_row.label_type = 'gt_a'
         AND input_row.label_status <> 'excluded'
         AND input_row.exclude_reason IS NOT NULL
       )
       OR (
         input_row.label_type = 'gt_b'
         AND input_row.label_status = 'excluded'
         AND (
           input_row.exclude_reason IS DISTINCT FROM 'insufficient_prices'
           OR input_row.basket_excess_return IS NOT NULL
         )
       )
       OR (
         input_row.label_type = 'gt_b'
         AND input_row.label_status = 'final'
         AND input_row.exclude_reason IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'legacy label finalizer row has a forbidden identity, status, or payload'
      USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(DISTINCT input_row.id)
    FROM jsonb_to_recordset(p_rows) AS input_row(id UUID)
  ) IS DISTINCT FROM v_requested_count::BIGINT THEN
    RAISE EXCEPTION 'legacy label finalizer rows must have unique ids'
      USING ERRCODE = '22023';
  END IF;

  WITH input_rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS input_row(
      id UUID,
      theme_id UUID,
      base_date DATE,
      label_type TEXT,
      horizon_days INTEGER,
      labeler_version TEXT,
      g_log_ratio NUMERIC,
      y_binary BOOLEAN,
      denominator NUMERIC,
      rescale_suspect BOOLEAN,
      low_signal BOOLEAN,
      keyword_epoch INTEGER,
      basket_excess_return NUMERIC,
      basket_size INTEGER,
      label_status TEXT,
      exclude_reason TEXT
    )
  )
  UPDATE public.theme_labels AS label
  SET
    g_log_ratio = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.g_log_ratio ELSE label.g_log_ratio END,
    y_binary = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.y_binary ELSE label.y_binary END,
    denominator = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.denominator ELSE label.denominator END,
    rescale_suspect = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.rescale_suspect ELSE label.rescale_suspect END,
    low_signal = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.low_signal ELSE label.low_signal END,
    keyword_epoch = CASE WHEN input_row.label_type = 'gt_a' THEN input_row.keyword_epoch ELSE label.keyword_epoch END,
    basket_excess_return = CASE WHEN input_row.label_type = 'gt_b' THEN input_row.basket_excess_return ELSE label.basket_excess_return END,
    basket_size = CASE WHEN input_row.label_type = 'gt_b' THEN input_row.basket_size ELSE label.basket_size END,
    label_status = input_row.label_status,
    exclude_reason = input_row.exclude_reason,
    finalized_at = clock_timestamp()
  FROM input_rows AS input_row
  WHERE label.id = input_row.id
    AND label.theme_id = input_row.theme_id
    AND label.base_date = input_row.base_date
    AND label.label_type = input_row.label_type
    AND label.horizon_days = input_row.horizon_days
    AND label.labeler_version = input_row.labeler_version
    AND label.label_status = 'pending';

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  IF v_affected_count IS DISTINCT FROM v_requested_count THEN
    RAISE EXCEPTION 'legacy label finalizer affected % of % rows',
      v_affected_count, v_requested_count
      USING ERRCODE = '55000';
  END IF;
  RETURN v_affected_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_tli_legacy_labels(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tli_legacy_labels(JSONB)
  TO service_role;

COMMENT ON FUNCTION public.finalize_tli_legacy_labels(JSONB) IS
  'Atomically finalizes exact pending gta-v1/gtb-v1 rows and rejects partial or zero-row matches.';

COMMIT;
