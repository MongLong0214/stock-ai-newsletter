BEGIN;
SET LOCAL lock_timeout = '5s';

-- stock_daily_prices remains a mutable cache, untouched by 067. It is no longer
-- the regime provenance source: neither row timestamps nor row presence prove
-- a committed, complete KOSPI session window at the forecast cutoff.
CREATE TABLE public.tli_kospi_close_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source = 'kis'),
  request_start DATE NOT NULL,
  request_end DATE NOT NULL,
  finalized_through DATE NOT NULL,
  trade_dates DATE[] NOT NULL,
  closes NUMERIC[] NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL,
  CHECK (request_start <= finalized_through AND finalized_through <= request_end),
  CHECK (array_ndims(trade_dates) = 1 AND array_lower(trade_dates, 1) = 1),
  CHECK (array_ndims(closes) = 1 AND array_lower(closes, 1) = 1),
  CHECK (cardinality(trade_dates) = cardinality(closes) AND cardinality(trade_dates) >= 21),
  CHECK (array_position(trade_dates, NULL) IS NULL AND array_position(closes, NULL) IS NULL),
  CHECK (trade_dates[cardinality(trade_dates)] = finalized_through),
  -- PostgreSQL orders numeric NaN above Infinity, so this excludes both too.
  CHECK (0 < ALL (closes) AND 'Infinity'::NUMERIC > ALL (closes))
);

CREATE TABLE public.tli_kospi_close_series_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.tli_kospi_close_series(id) ON DELETE RESTRICT,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  attested_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tli_kospi_series_finalized ON public.tli_kospi_close_series (finalized_through);
CREATE INDEX idx_tli_kospi_series_attested ON public.tli_kospi_close_series_attestations (series_id, attested_at DESC);

CREATE TRIGGER guard_tli_kospi_close_series_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_kospi_close_series
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();
CREATE TRIGGER guard_tli_kospi_series_attestations_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_kospi_close_series_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation();

ALTER TABLE public.tli_kospi_close_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tli_kospi_close_series_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_select_tli_kospi_close_series
  ON public.tli_kospi_close_series FOR SELECT TO service_role USING (true);
CREATE POLICY service_role_select_tli_kospi_series_attestations
  ON public.tli_kospi_close_series_attestations FOR SELECT TO service_role USING (true);
REVOKE ALL ON TABLE public.tli_kospi_close_series, public.tli_kospi_close_series_attestations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.tli_kospi_close_series, public.tli_kospi_close_series_attestations TO service_role;

CREATE FUNCTION public.record_tli_kospi_close_series(
  p_request_start DATE,
  p_request_end DATE,
  p_finalized_through DATE,
  p_trade_dates DATE[],
  p_closes NUMERIC[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
  v_index INTEGER;
  v_canonical TEXT;
  v_sha TEXT;
BEGIN
  IF p_request_start IS NULL OR p_request_end IS NULL OR p_finalized_through IS NULL
     OR NOT isfinite(p_request_start) OR NOT isfinite(p_request_end) OR NOT isfinite(p_finalized_through)
     OR p_request_start > p_finalized_through OR p_finalized_through > p_request_end
     OR p_trade_dates IS NULL OR p_closes IS NULL
     OR array_ndims(p_trade_dates) IS DISTINCT FROM 1 OR array_lower(p_trade_dates, 1) IS DISTINCT FROM 1
     OR array_ndims(p_closes) IS DISTINCT FROM 1 OR array_lower(p_closes, 1) IS DISTINCT FROM 1
     OR cardinality(p_trade_dates) < 21 OR cardinality(p_trade_dates) <> cardinality(p_closes)
  THEN
    RAISE EXCEPTION 'KOSPI series requires a valid request range and at least 21 paired points'
      USING ERRCODE = '22023';
  END IF;

  FOR v_index IN 1..cardinality(p_trade_dates) LOOP
    IF p_trade_dates[v_index] IS NULL OR NOT isfinite(p_trade_dates[v_index])
       OR p_trade_dates[v_index] < p_request_start OR p_trade_dates[v_index] > p_finalized_through
       OR (v_index > 1 AND p_trade_dates[v_index] <= p_trade_dates[v_index - 1])
       OR p_closes[v_index] IS NULL OR p_closes[v_index] <= 0
       OR p_closes[v_index]::text IN ('NaN','Infinity','-Infinity')
    THEN
      RAISE EXCEPTION 'KOSPI series dates must be strictly ascending and closes finite positive numbers'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_trade_dates[cardinality(p_trade_dates)] IS DISTINCT FROM p_finalized_through THEN
    RAISE EXCEPTION 'KOSPI series last date must equal finalized_through'
      USING ERRCODE = '22023';
  END IF;

  -- Canonical UTF-8 bytes, no whitespace or trailing newline:
  -- kis|<YYYY-MM-DD,... in array order>|<close,... in array order>
  -- Each close is trim_scale(NUMERIC)::text: decimal notation, no trailing
  -- fractional zeros (e.g. 100.00 -> 100). Request bounds are not payload data.
  SELECT 'kis|' || string_agg(to_char(p_trade_dates[i], 'YYYY-MM-DD'), ',' ORDER BY i)
         || '|' || string_agg(trim_scale(p_closes[i])::text, ',' ORDER BY i)
  INTO v_canonical
  FROM generate_subscripts(p_trade_dates, 1) AS points(i);
  v_sha := encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex');

  -- Repeated identical responses still append independent evidence rows.
  INSERT INTO public.tli_kospi_close_series (
    source, request_start, request_end, finalized_through, trade_dates, closes, payload_sha256, recorded_at
  ) VALUES (
    'kis', p_request_start, p_request_end, p_finalized_through, p_trade_dates, p_closes, v_sha, clock_timestamp()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.attest_tli_kospi_close_series(p_series_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_series public.tli_kospi_close_series%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_series FROM public.tli_kospi_close_series WHERE id = p_series_id;
  IF NOT FOUND OR v_series.recorded_at >= now() THEN
    RAISE EXCEPTION 'KOSPI series attestation requires a row committed by another transaction'
      USING ERRCODE = '55000';
  END IF;

  -- Visibility excludes another transaction's uncommitted row. now() is THIS
  -- transaction's start; clock_timestamp() at record is >= that start for any
  -- same-transaction insert, so recorded_at < now() excludes our own inserts.
  -- Thus the visible row committed before the SELECT's statement snapshot:
  -- attested_at >= statement snapshot time >= series commit time.
  -- This does not assert that the attestation itself has committed at its stamp.
  INSERT INTO public.tli_kospi_close_series_attestations (series_id, payload_sha256, attested_at)
  VALUES (v_series.id, v_series.payload_sha256, clock_timestamp()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_tli_kospi_close_series(DATE, DATE, DATE, DATE[], NUMERIC[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tli_kospi_close_series(DATE, DATE, DATE, DATE[], NUMERIC[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.attest_tli_kospi_close_series(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attest_tli_kospi_close_series(UUID) TO service_role;

-- Historical enrollments retain their two source ids. New enrollments append
-- the exact attested response id/hash as the third id and hash input.
ALTER TABLE public.tli_experiment_origin_manifests
  DROP CONSTRAINT tli_experiment_origin_manifests_kospi_source_ids_check,
  ADD CONSTRAINT tli_experiment_origin_manifests_kospi_source_ids_check
    CHECK (jsonb_typeof(kospi_source_ids) = 'array' AND jsonb_array_length(kospi_source_ids) IN (2, 3));

CREATE OR REPLACE FUNCTION public.enroll_tli_origin(
  p_cycle_id UUID,
  p_study_origin_manifest_id UUID,
  p_forecast_origin_manifest_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cycle public.tli_experiment_cycles%ROWTYPE;
  v_study_origin public.tli_study_origin_manifests%ROWTYPE;
  v_forecast public.tli_forecast_origin_manifests%ROWTYPE;
  v_sequence INTEGER;
  v_role TEXT;
  v_canary SMALLINT;
  v_canary_count INTEGER;
  v_effective_end DATE;
  v_latest_origin_date DATE;
  v_base_trade_date DATE;
  v_base_close NUMERIC;
  v_base_source TEXT;
  v_lookback_trade_date DATE;
  v_lookback_close NUMERIC;
  v_lookback_source TEXT;
  v_source_ids TEXT[];
  v_input_values TEXT[];
  v_source_ids_json JSONB;
  v_input_sha TEXT;
  v_return NUMERIC;
  v_regime TEXT;
  v_origin_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('tli-cycle-v1|' || p_cycle_id::text, 0));

  SELECT * INTO v_cycle
  FROM public.tli_experiment_cycles
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF NOT FOUND OR v_cycle.status NOT IN ('running','promoted_internal','public_approved') THEN
    RAISE EXCEPTION 'origin enrollment is forbidden for this cycle status'
      USING ERRCODE = '55000';
  END IF;

  IF v_cycle.status = 'public_approved'
     AND NOT EXISTS (
       SELECT 1
       FROM public.model_registry AS registry
       WHERE registry.experiment_cycle_id = v_cycle.id
         AND registry.model_version = v_cycle.candidate_model_version
         AND registry.status = 'champion'
         AND registry.scientific_claim_status = 'eligible'
         AND registry.scientific_release_status IN ('public','blocked')
         AND registry.gate_result ->> 'model_artifact_sha256' = v_cycle.candidate_model_sha256
     )
  THEN
    RAISE EXCEPTION 'monitoring enrollment requires the current exact public champion'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND (
        study_origin_manifest_id = p_study_origin_manifest_id
        OR forecast_origin_manifest_id = p_forecast_origin_manifest_id
      )
  ) THEN
    RAISE EXCEPTION 'same cycle origin is already enrolled'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_study_origin
  FROM public.tli_study_origin_manifests
  WHERE id = p_study_origin_manifest_id;
  SELECT * INTO v_forecast
  FROM public.tli_forecast_origin_manifests
  WHERE id = p_forecast_origin_manifest_id;

  IF v_study_origin.id IS NULL
     OR v_forecast.id IS NULL
     OR v_study_origin.study_contract_id IS DISTINCT FROM v_cycle.study_contract_id
     OR v_study_origin.forecast_origin_manifest_id IS DISTINCT FROM v_forecast.id
     OR NOT EXISTS (
       SELECT 1
       FROM public.tli_attention_study_contracts
       WHERE id = v_study_origin.study_contract_id
         AND payload_sha256 = v_cycle.study_contract_sha256
     )
  THEN
    RAISE EXCEPTION 'enrolled study origin, forecast foundation, and cycle study must match exactly'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(max(calendar_extension.new_end), v_cycle.initial_calendar_end)
  INTO v_effective_end
  FROM public.tli_cycle_calendar_extensions AS calendar_extension
  WHERE calendar_extension.cycle_id = p_cycle_id;

  IF v_cycle.status = 'running'
     AND (
       v_forecast.origin_date < v_cycle.calendar_start
       OR v_forecast.origin_date > v_effective_end
       OR v_forecast.forecast_cutoff <= v_cycle.running_at
     )
  THEN
    RAISE EXCEPTION 'running enrollment requires a prospective foundation inside the effective calendar'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(sequence_no), 0) + 1,
         max(forecast.origin_date)
  INTO v_sequence, v_latest_origin_date
  FROM public.tli_experiment_origin_manifests AS enrolled
  JOIN public.tli_forecast_origin_manifests AS forecast
    ON forecast.id = enrolled.forecast_origin_manifest_id
  WHERE enrolled.cycle_id = p_cycle_id;

  IF v_latest_origin_date IS NOT NULL AND v_forecast.origin_date <= v_latest_origin_date THEN
    RAISE EXCEPTION 'origin enrollment dates must be strictly increasing'
      USING ERRCODE = '22023';
  END IF;

  v_canary_count := (
    SELECT count(*)
    FROM public.tli_experiment_origin_manifests
    WHERE cycle_id = p_cycle_id
      AND enrollment_role = 'public_canary'
  );

  v_role := CASE
    WHEN v_cycle.status = 'running'
      THEN CASE WHEN v_sequence <= v_cycle.planned_origins THEN 'confirmatory' ELSE 'predecision_diagnostic' END
    WHEN v_cycle.status = 'promoted_internal'
      THEN CASE WHEN v_canary_count < 4 THEN 'public_canary' ELSE 'prepublic_diagnostic' END
    WHEN v_cycle.status = 'public_approved'
      THEN 'monitoring'
  END;

  IF v_cycle.status = 'promoted_internal' THEN
    IF v_forecast.forecast_cutoff <= v_cycle.promoted_internal_at THEN
      RAISE EXCEPTION 'public canary and prepublic origins must be after internal promotion'
        USING ERRCODE = '22023';
    END IF;
    IF v_canary_count < 4 THEN
      v_canary := (v_canary_count + 1)::SMALLINT;
    END IF;
  ELSIF v_cycle.status = 'public_approved'
        AND v_forecast.forecast_cutoff <= v_cycle.public_approved_at
  THEN
    RAISE EXCEPTION 'monitoring origins must be after public approval'
      USING ERRCODE = '22023';
  END IF;

  -- One attested KIS response fixes both the session calendar and its closes.
  SELECT series.trade_dates[cardinality(series.trade_dates)],
         series.closes[cardinality(series.closes)], series.source,
         series.trade_dates[cardinality(series.trade_dates) - 20],
         series.closes[cardinality(series.closes) - 20], series.source,
         ARRAY['KOSPI_SERIES|' || series.id::text || '|' || series.payload_sha256]
  INTO v_base_trade_date, v_base_close, v_base_source,
       v_lookback_trade_date, v_lookback_close, v_lookback_source, v_source_ids
  FROM public.tli_kospi_close_series AS series
  JOIN public.tli_kospi_close_series_attestations AS attestation
    ON attestation.series_id = series.id
  WHERE series.finalized_through = v_forecast.origin_date
    AND attestation.attested_at <= v_forecast.forecast_cutoff
  ORDER BY attestation.attested_at DESC, series.id ASC
  LIMIT 1;

  IF v_base_trade_date IS NULL OR v_base_trade_date IS DISTINCT FROM v_forecast.origin_date THEN
    RAISE EXCEPTION 'enrollment requires a tradable Monday KOSPI base close at the forecast cutoff'
      USING ERRCODE = '55000';
  END IF;

  IF v_lookback_trade_date IS NULL THEN
    RAISE EXCEPTION 'KOSPI 20-trading-day lookback is unavailable at the forecast cutoff'
      USING ERRCODE = '55000';
  END IF;

  IF v_base_close IS NULL
     OR v_lookback_close IS NULL
     OR v_base_close::text IN ('NaN','Infinity','-Infinity')
     OR v_lookback_close::text IN ('NaN','Infinity','-Infinity')
  THEN
    RAISE EXCEPTION 'KOSPI provenance closes must be finite positive numbers'
      USING ERRCODE = '22023';
  END IF;

  v_source_ids := ARRAY[
    'KOSPI|' || to_char(v_base_trade_date, 'YYYY-MM-DD') || '|' || v_base_source,
    'KOSPI|' || to_char(v_lookback_trade_date, 'YYYY-MM-DD') || '|' || v_lookback_source
  ] || v_source_ids;
  v_source_ids_json := to_jsonb(v_source_ids);
  v_input_values := ARRAY[
    v_source_ids[1] || '|' || v_base_close::text,
    v_source_ids[2] || '|' || v_lookback_close::text
  ] || v_source_ids[3];
  v_input_sha := public.tli_sha256_ordered_json_string_array(v_input_values);
  v_return := (v_base_close / v_lookback_close) - 1;
  v_regime := CASE
    WHEN v_return <= -0.03 THEN 'risk_off'
    WHEN v_return >= 0.03 THEN 'risk_on'
    ELSE 'neutral'
  END;

  INSERT INTO public.tli_experiment_origin_manifests (
    cycle_id,
    study_origin_manifest_id,
    forecast_origin_manifest_id,
    sequence_no,
    enrollment_role,
    public_canary_no,
    candidate_model_sha256,
    comparator_artifact_sha256,
    kospi_base_trade_date,
    kospi_base_close,
    kospi_lookback_trade_date,
    kospi_lookback_close,
    kospi_source_ids,
    kospi_input_sha256,
    regime
  )
  VALUES (
    p_cycle_id,
    p_study_origin_manifest_id,
    p_forecast_origin_manifest_id,
    v_sequence,
    v_role,
    v_canary,
    v_cycle.candidate_model_sha256,
    v_cycle.comparator_artifact_sha256,
    v_base_trade_date,
    v_base_close,
    v_lookback_trade_date,
    v_lookback_close,
    v_source_ids_json,
    v_input_sha,
    v_regime
  )
  RETURNING id INTO v_origin_id;

  RETURN v_origin_id;
END;
$$;

COMMIT;
