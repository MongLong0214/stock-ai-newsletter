BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- TLI v3 Todo 7: gta-v2 exact-five / versioned ground-truth labels.
--
-- 046의 immutable forecast/source snapshot 위에 gta-v2 label 계약을 얹는다:
--   · label unique key에 labeler_version 포함 (v1 row 보존).
--   · past/future 날짜 배열(각 5) + 046 foundation/source table 3종 nullable FK.
--   · gta-v2 pending/final row는 origin_date=base_date인 forecast manifest+theme child 필수,
--     legacy v1은 세 FK를 null로 둔다.
--   · pending insert는 exploratory_only/pending_gta_v2 강제. finalizer RPC만 같은 transaction에서
--     pending→final(confirmatory_eligible/gta_v2_exact_contract) 또는 exact exclusion code로 전이한다.
--   · confirmatory denominator 계약은 정확히 past_mean>0 (양수 absolute floor·future-window maximum
--     eligibility 분기 금지). y=1[ratio>=1.10] (로그값 0.10 threshold 금지). future_mean=0이면 g=-1.5.
--   · source arrival SLA: horizon 뒤 3번째 한국 거래일 18:00 KST 미달이면 source_gap_sla.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. gta-v2 provenance columns (nullable; legacy v1 rows keep them null).
ALTER TABLE public.theme_labels
  ADD COLUMN IF NOT EXISTS past_dates JSONB,
  ADD COLUMN IF NOT EXISTS future_dates JSONB,
  ADD COLUMN IF NOT EXISTS forecast_origin_manifest_id UUID
    REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS forecast_interest_run_id UUID
    REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS label_source_run_id UUID
    REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_cutoff TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_max_date DATE,
  ADD COLUMN IF NOT EXISTS label_request_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS label_response_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS past_observation_count INTEGER,
  ADD COLUMN IF NOT EXISTS future_observation_count INTEGER,
  ADD COLUMN IF NOT EXISTS forecast_keyword_group_sha256 TEXT;

ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_gta_v2_sha_format_check CHECK (
    (label_request_sha256 IS NULL OR label_request_sha256 ~ '^[0-9a-f]{64}$')
    AND (label_response_sha256 IS NULL OR label_response_sha256 ~ '^[0-9a-f]{64}$')
    AND (forecast_keyword_group_sha256 IS NULL OR forecast_keyword_group_sha256 ~ '^[0-9a-f]{64}$')
  );

-- 2. Unique key now includes labeler_version so v1 and v2 rows coexist per (theme, date, type, horizon).
ALTER TABLE public.theme_labels
  DROP CONSTRAINT IF EXISTS theme_labels_theme_id_base_date_label_type_horizon_days_key;
ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_identity_key
  UNIQUE (theme_id, base_date, label_type, horizon_days, labeler_version);

-- 3. Extend scientific-use state transitions for gta-v2 (045's gta-v1 lock stays intact).
ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_gta_v2_scientific_use_check CHECK (
    labeler_version <> 'gta-v2'
    OR (label_status = 'pending'
        AND scientific_use_status = 'exploratory_only'
        AND scientific_use_reason = 'pending_gta_v2')
    OR (label_status = 'final'
        AND scientific_use_status = 'confirmatory_eligible'
        AND scientific_use_reason = 'gta_v2_exact_contract')
    OR (label_status = 'excluded'
        AND scientific_use_status = 'exploratory_only'
        AND scientific_use_reason IN ('zero_denominator','source_gap_sla','spec_mismatch'))
  );

-- 4. gta-v2 final rows must carry the exact 5+5 provenance and a past_mean>0 denominator.
ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_gta_v2_final_provenance_check CHECK (
    NOT (labeler_version = 'gta-v2' AND label_status = 'final')
    OR (
      label_type = 'gt_a'
      AND horizon_days = 5
      AND forecast_origin_manifest_id IS NOT NULL
      AND forecast_interest_run_id IS NOT NULL
      AND label_source_run_id IS NOT NULL
      AND forecast_keyword_group_sha256 IS NOT NULL
      AND label_request_sha256 IS NOT NULL
      AND label_response_sha256 IS NOT NULL
      AND source_cutoff IS NOT NULL
      AND source_max_date IS NOT NULL
      AND past_dates IS NOT NULL AND jsonb_array_length(past_dates) = 5
      AND future_dates IS NOT NULL AND jsonb_array_length(future_dates) = 5
      AND past_observation_count = 5
      AND future_observation_count = 5
      AND denominator IS NOT NULL AND denominator > 0
      AND g_log_ratio IS NOT NULL AND g_log_ratio >= -1.5 AND g_log_ratio <= 1.5
      AND y_binary IS NOT NULL
      AND rescale_suspect = false
    )
  );

CREATE INDEX IF NOT EXISTS idx_theme_labels_gta_v2_confirmatory
  ON public.theme_labels (forecast_origin_manifest_id, theme_id, base_date)
  WHERE labeler_version = 'gta-v2'
    AND label_status = 'final'
    AND scientific_use_status = 'confirmatory_eligible';

-- 5. Provenance guard on INSERT: gta-v2 needs an origin_date=base_date manifest with a matching
--    theme child; legacy labels must leave all three gta-v2 foreign keys null.
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
    IF NEW.label_status NOT IN ('pending','final','excluded') THEN
      RAISE EXCEPTION 'gta-v2 labels never use the censored status'
        USING ERRCODE = '22023';
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
  ELSE
    IF NEW.forecast_origin_manifest_id IS NOT NULL
       OR NEW.forecast_interest_run_id IS NOT NULL
       OR NEW.label_source_run_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'legacy labels must leave gta-v2 provenance foreign keys null'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_tli_gta_v2_label_provenance_insert
  BEFORE INSERT ON public.theme_labels
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tli_gta_v2_label_provenance();

-- 6. Transition guard on UPDATE/DELETE: gta-v2 rows are permanent, adjudicated exactly once,
--    and only through finalize_tli_gta_v2_label (session-scoped guard token). Legacy rows are untouched.
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

  IF current_setting('tli.finalize_gta_v2_label_id', true) IS DISTINCT FROM OLD.id::text THEN
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

CREATE TRIGGER guard_tli_gta_v2_label_transition
  BEFORE UPDATE OR DELETE ON public.theme_labels
  FOR EACH ROW EXECUTE FUNCTION public.guard_tli_gta_v2_label_transition();

-- 7. Finalizer RPC: re-derives the exact 5 past + 5 future Korean trading dates, reads the frozen
--    keyword group's dedicated single DataLab response, validates the exact-five/spec/source/cutoff and
--    past_mean>0 contract, and atomically transitions the pending row. It never stitches responses,
--    reuses the current keyword, or censors post-cutoff theme deactivation.
CREATE OR REPLACE FUNCTION public.finalize_tli_gta_v2_label(
  p_label_canonical_json TEXT,
  p_payload_sha256 TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload JSONB;
  v_allowed_keys CONSTANT TEXT[] := ARRAY[
    'theme_id',
    'base_date',
    'forecast_origin_manifest_id',
    'as_of',
    'label_source_run_id',
    'label_request_sha256',
    'label_response_sha256',
    'g_log_ratio',
    'y_binary'
  ];
  v_theme_id UUID;
  v_base_date DATE;
  v_manifest_id UUID;
  v_as_of TIMESTAMPTZ;
  v_source_run_id UUID;
  v_request_sha256 TEXT;
  v_response_sha256 TEXT;
  v_g_log_ratio NUMERIC;
  v_y_binary BOOLEAN;
  v_label RECORD;
  v_manifest RECORD;
  v_child RECORD;
  v_source_run RECORD;
  v_cutoff TIMESTAMPTZ;
  v_past_dates DATE[];
  v_future_dates DATE[];
  v_horizon_date DATE;
  v_grace_deadline TIMESTAMPTZ;
  v_past_count INTEGER;
  v_future_count INTEGER;
  v_past_sum NUMERIC;
  v_future_sum NUMERIC;
  v_past_mean NUMERIC;
  v_expected_y BOOLEAN;
  v_new_status TEXT;
  v_new_reason TEXT;
BEGIN
  v_payload := public.tli_parse_canonical_json_v1(p_label_canonical_json, p_payload_sha256);

  IF public.tli_jsonb_object_key_count(v_payload) <> cardinality(v_allowed_keys)
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(v_payload) AS payload_key(key)
       WHERE NOT (payload_key.key = ANY(v_allowed_keys))
     )
     OR jsonb_typeof(v_payload -> 'theme_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'base_date') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'forecast_origin_manifest_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'as_of') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_payload -> 'label_source_run_id') NOT IN ('string','null')
     OR jsonb_typeof(v_payload -> 'label_request_sha256') NOT IN ('string','null')
     OR jsonb_typeof(v_payload -> 'label_response_sha256') NOT IN ('string','null')
     OR jsonb_typeof(v_payload -> 'g_log_ratio') NOT IN ('number','null')
     OR jsonb_typeof(v_payload -> 'y_binary') NOT IN ('boolean','null')
  THEN
    RAISE EXCEPTION 'gta-v2 finalize payload has unknown, missing, or malformed fields'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_theme_id := (v_payload ->> 'theme_id')::UUID;
    v_base_date := (v_payload ->> 'base_date')::DATE;
    v_manifest_id := (v_payload ->> 'forecast_origin_manifest_id')::UUID;
    v_as_of := (v_payload ->> 'as_of')::TIMESTAMPTZ;
    v_source_run_id := NULLIF(v_payload ->> 'label_source_run_id', '')::UUID;
    v_request_sha256 := v_payload ->> 'label_request_sha256';
    v_response_sha256 := v_payload ->> 'label_response_sha256';
    v_g_log_ratio := (v_payload ->> 'g_log_ratio')::NUMERIC;
    v_y_binary := (v_payload ->> 'y_binary')::BOOLEAN;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'gta-v2 finalize payload contains invalid typed values'
      USING ERRCODE = '22023';
  END;

  IF v_payload ->> 'base_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR v_payload ->> 'base_date' IS DISTINCT FROM to_char(v_base_date, 'YYYY-MM-DD')
     OR v_payload ->> 'theme_id' IS DISTINCT FROM v_theme_id::text
     OR v_payload ->> 'forecast_origin_manifest_id' IS DISTINCT FROM v_manifest_id::text
     OR (v_source_run_id IS NOT NULL AND v_payload ->> 'label_source_run_id' IS DISTINCT FROM v_source_run_id::text)
  THEN
    RAISE EXCEPTION 'gta-v2 finalize identity must be canonical lowercase'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_label
  FROM public.theme_labels
  WHERE theme_id = v_theme_id
    AND base_date = v_base_date
    AND label_type = 'gt_a'
    AND horizon_days = 5
    AND labeler_version = 'gta-v2'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no gta-v2 label to finalize for this theme and base date'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_label.label_status <> 'pending' THEN
    RAISE EXCEPTION 'gta-v2 label is already terminal and cannot be re-adjudicated'
      USING ERRCODE = '42501';
  END IF;
  IF v_label.forecast_origin_manifest_id IS DISTINCT FROM v_manifest_id THEN
    RAISE EXCEPTION 'gta-v2 finalize manifest does not match the pending label'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_manifest
  FROM public.tli_forecast_origin_manifests
  WHERE id = v_manifest_id;
  IF NOT FOUND OR v_manifest.origin_date IS DISTINCT FROM v_base_date THEN
    RAISE EXCEPTION 'forecast origin manifest is missing or has a wrong origin date'
      USING ERRCODE = '22023';
  END IF;
  v_cutoff := v_manifest.forecast_cutoff;

  SELECT * INTO v_child
  FROM public.tli_forecast_origin_theme_inputs
  WHERE forecast_origin_manifest_id = v_manifest_id
    AND theme_id = v_theme_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forecast manifest has no theme child for this label'
      USING ERRCODE = '22023';
  END IF;

  -- exact 5 past (base date + prior 4) and 5 future Korean trading dates.
  SELECT array_agg(trade_date ORDER BY trade_date)
  INTO v_past_dates
  FROM (
    SELECT trade_date
    FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI' AND trade_date <= v_base_date
    ORDER BY trade_date DESC
    LIMIT 5
  ) AS past_trading_dates;

  SELECT array_agg(trade_date ORDER BY trade_date)
  INTO v_future_dates
  FROM (
    SELECT trade_date
    FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI' AND trade_date > v_base_date
    ORDER BY trade_date ASC
    LIMIT 5
  ) AS future_trading_dates;

  IF cardinality(v_past_dates) IS DISTINCT FROM 5
     OR cardinality(v_future_dates) IS DISTINCT FROM 5
     OR v_past_dates[5] IS DISTINCT FROM v_base_date
  THEN
    RAISE EXCEPTION 'gta-v2 requires exactly five past and five future Korean trading dates around the base date'
      USING ERRCODE = '55000';
  END IF;

  v_horizon_date := v_future_dates[5];

  -- grace deadline = 3rd Korean trading date after the horizon at 18:00 KST; null until it exists.
  WITH grace_dates AS (
    SELECT trade_date
    FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI' AND trade_date > v_horizon_date
    ORDER BY trade_date ASC
    LIMIT 3
  )
  SELECT CASE
    WHEN count(*) = 3
    THEN ((max(trade_date)::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul')
    ELSE NULL
  END
  INTO v_grace_deadline
  FROM grace_dates;

  IF v_child.input_status = 'abstain' THEN
    -- No frozen usable keyword group / interest run at this origin: not a confirmatory sample.
    v_new_status := 'excluded';
    v_new_reason := 'spec_mismatch';
  ELSIF v_source_run_id IS NULL THEN
    -- Dedicated label response has not been collected.
    IF v_grace_deadline IS NULL OR v_as_of < v_grace_deadline THEN
      RAISE EXCEPTION 'gta-v2 source has not arrived and the grace window has not elapsed; keep pending'
        USING ERRCODE = '55000';
    END IF;
    v_new_status := 'excluded';
    v_new_reason := 'source_gap_sla';
  ELSE
    IF v_request_sha256 IS NULL OR v_response_sha256 IS NULL THEN
      RAISE EXCEPTION 'gta-v2 label source run requires its request and response hashes'
        USING ERRCODE = '22023';
    END IF;

    -- One complete DataLab run for the frozen keyword group, produced by/at the cutoff-safe as_of.
    SELECT * INTO v_source_run
    FROM public.tli_collection_runs
    WHERE id = v_source_run_id
      AND source = 'naver_datalab'
      AND status = 'complete'
      AND keyword_group_hash = v_child.keyword_group_sha256
      AND request_sha256 = v_request_sha256
      AND response_sha256 = v_response_sha256
      AND collected_at <= v_as_of;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'gta-v2 label source run is wrong, incomplete, spec-mismatched, or after as_of'
        USING ERRCODE = '55000';
    END IF;

    -- Exactly the 5+5 values from this single response.
    SELECT
      count(*) FILTER (WHERE trading_date = ANY(v_past_dates)),
      sum(normalized) FILTER (WHERE trading_date = ANY(v_past_dates)),
      count(*) FILTER (WHERE trading_date = ANY(v_future_dates)),
      sum(normalized) FILTER (WHERE trading_date = ANY(v_future_dates))
    INTO v_past_count, v_past_sum, v_future_count, v_future_sum
    FROM public.tli_interest_observations
    WHERE collection_run_id = v_source_run_id
      AND theme_id = v_theme_id
      AND source = 'naver_datalab'
      AND trading_date = ANY(v_past_dates || v_future_dates);

    IF v_past_count IS DISTINCT FROM 5 THEN
      RAISE EXCEPTION 'gta-v2 requires exactly five past observations from one response'
        USING ERRCODE = '55000';
    END IF;

    IF v_future_count < 5 THEN
      IF v_grace_deadline IS NULL OR v_as_of < v_grace_deadline THEN
        RAISE EXCEPTION 'gta-v2 future window is incomplete and still within grace; keep pending'
          USING ERRCODE = '55000';
      END IF;
      v_new_status := 'excluded';
      v_new_reason := 'source_gap_sla';
    ELSE
      IF v_source_run.source_max_date < v_horizon_date THEN
        RAISE EXCEPTION 'gta-v2 label source_max_date does not cover the horizon date'
          USING ERRCODE = '55000';
      END IF;
      IF v_past_sum < 0 OR v_future_sum < 0 THEN
        RAISE EXCEPTION 'gta-v2 response values must be finite and nonnegative'
          USING ERRCODE = '22023';
      END IF;

      IF v_past_sum = 0 THEN
        -- denominator_valid = 1[past_mean > 0]; this is the ONLY exclusion by denominator.
        v_new_status := 'excluded';
        v_new_reason := 'zero_denominator';
      ELSE
        v_past_mean := v_past_sum / 5;
        -- y = 1[ratio >= 1.10] = 1[10 * future_sum >= 11 * past_sum]. Exact rational, scale invariant.
        v_expected_y := (v_future_sum * 10 >= v_past_sum * 11);
        IF v_y_binary IS NULL OR v_y_binary IS DISTINCT FROM v_expected_y THEN
          RAISE EXCEPTION 'gta-v2 y_binary must equal the exact ratio>=1.10 outcome'
            USING ERRCODE = '22023';
        END IF;
        IF v_g_log_ratio IS NULL THEN
          RAISE EXCEPTION 'gta-v2 final label requires a g_log_ratio'
            USING ERRCODE = '22023';
        END IF;
        IF v_future_sum = 0 THEN
          IF v_g_log_ratio IS DISTINCT FROM -1.5 THEN
            RAISE EXCEPTION 'gta-v2 g_log_ratio must be -1.5 when the future mean is zero'
              USING ERRCODE = '22023';
          END IF;
        ELSIF v_g_log_ratio < -1.5 OR v_g_log_ratio > 1.5 THEN
          RAISE EXCEPTION 'gta-v2 g_log_ratio must be winsorized to [-1.5, 1.5]'
            USING ERRCODE = '22023';
        END IF;
        v_new_status := 'final';
        v_new_reason := 'gta_v2_exact_contract';
      END IF;
    END IF;
  END IF;

  PERFORM set_config('tli.finalize_gta_v2_label_id', v_label.id::text, true);

  IF v_new_status = 'final' THEN
    UPDATE public.theme_labels SET
      label_status = 'final',
      scientific_use_status = 'confirmatory_eligible',
      scientific_use_reason = 'gta_v2_exact_contract',
      exclude_reason = NULL,
      g_log_ratio = v_g_log_ratio,
      y_binary = v_y_binary,
      denominator = v_past_mean,
      rescale_suspect = false,
      forecast_keyword_group_sha256 = v_child.keyword_group_sha256,
      forecast_interest_run_id = v_child.forecast_interest_run_id,
      label_source_run_id = v_source_run_id,
      label_request_sha256 = v_request_sha256,
      label_response_sha256 = v_response_sha256,
      source_cutoff = v_cutoff,
      source_max_date = v_source_run.source_max_date,
      past_dates = to_jsonb(array(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(v_past_dates) AS d)),
      future_dates = to_jsonb(array(SELECT to_char(d, 'YYYY-MM-DD') FROM unnest(v_future_dates) AS d)),
      past_observation_count = 5,
      future_observation_count = 5,
      finalized_at = clock_timestamp()
    WHERE id = v_label.id;
  ELSE
    UPDATE public.theme_labels SET
      label_status = 'excluded',
      scientific_use_status = 'exploratory_only',
      scientific_use_reason = v_new_reason,
      exclude_reason = v_new_reason,
      g_log_ratio = NULL,
      y_binary = NULL,
      denominator = NULL,
      forecast_keyword_group_sha256 = v_child.keyword_group_sha256,
      forecast_interest_run_id = NULL,
      label_source_run_id = NULL,
      label_request_sha256 = NULL,
      label_response_sha256 = NULL,
      source_cutoff = v_cutoff,
      source_max_date = NULL,
      past_dates = NULL,
      future_dates = NULL,
      past_observation_count = NULL,
      future_observation_count = NULL,
      finalized_at = clock_timestamp()
    WHERE id = v_label.id;
  END IF;

  RETURN v_label.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_tli_gta_v2_label_provenance()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.guard_tli_gta_v2_label_transition()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_tli_gta_v2_label(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tli_gta_v2_label(TEXT, TEXT)
  TO service_role;

COMMENT ON COLUMN public.theme_labels.forecast_origin_manifest_id IS
  'gta-v2 only: universal forecast origin whose origin_date equals base_date; legacy labels leave it null.';
COMMENT ON COLUMN public.theme_labels.label_source_run_id IS
  'gta-v2 only: the single dedicated DataLab collection run that produced the exact 5+5 response values.';
COMMENT ON FUNCTION public.finalize_tli_gta_v2_label(TEXT, TEXT) IS
  'Validates exact-five/spec/source/cutoff and past_mean>0, then atomically transitions one pending gta-v2 label to final or an exact exclusion code.';

COMMIT;
