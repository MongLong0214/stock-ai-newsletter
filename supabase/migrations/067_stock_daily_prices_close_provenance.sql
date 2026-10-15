BEGIN;
SET LOCAL lock_timeout = '5s';
-- ADD COLUMN의 ACCESS EXCLUSIVE 대기가 stock_daily_prices의 모든 읽기·쓰기를 긴 트랜잭션 뒤에 줄 세우지 않도록
-- 빨리 실패시켜 한가할 때 재시도한다. 기본값 없는 nullable 컬럼 추가는 테이블을 다시 쓰지 않는다.

-- stock_daily_prices는 (symbol, trade_date) upsert로 갱신되는 가변 테이블이다. created_at은 행이 처음 생긴
-- 시각일 뿐이라 "그 종가가 cutoff 전에 저장됐다"의 증거가 아니다(2026-08-31 KOSPI 행은 08:51 개장 전
-- phantom으로 생성된 뒤 같은 날 나중에 실제 종가로 덮어써졌다). enroll_tli_origin의 KOSPI regime
-- provenance(master plan: forecast cutoff까지 실제 저장된 base close)는 종가·source·관측 식별자가 마지막으로
-- 쓰인 서버 시각(clock_timestamp)으로 판정해야 한다. created_at과 close_written_at은 호출자가
-- 과거로 지정할 수 있으므로 close/source/symbol/trade_date가 현재 값을 갖게 된 시각은 호출자가 설정할 수 없어야 한다.
-- NULL은 067 이전 legacy 행이라 created_at만 증거로 남으므로 enroll은 COALESCE(close_written_at, created_at)을 쓴다.
--
-- 잔여 한계: close_written_at은 커밋이 아닌 트리거 실행 시각이고 운영의 track_commit_timestamp는 꺼져 있어
-- cutoff 전에 찍힌 뒤 cutoff 후에 커밋된 트랜잭션은 구별할 수 없다. legacy NULL 행은 created_at만이 증거다.
-- session_replication_role=replica 또는 테이블 소유자의 트리거 비활성화는 이 보호를 우회한다.
ALTER TABLE public.stock_daily_prices
  ADD COLUMN close_written_at TIMESTAMPTZ;

COMMENT ON COLUMN public.stock_daily_prices.close_written_at IS
  'close/source가 현재 값을 갖게 된 서버 시각(clock_timestamp). 트리거만 기록하며 호출자가 설정할 수 없다. NULL은 067 이전 legacy 행이라 created_at만 증거로 남으므로 enroll은 COALESCE(close_written_at, created_at)을 쓴다.';

CREATE FUNCTION public.stamp_stock_daily_price_close_written_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- legacy NULL 행의 유일한 증거를 과거로 위조하지 못하도록 최초 생성 시각을 고정한다.
    NEW.created_at := OLD.created_at;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.close_written_at := clock_timestamp();
  ELSIF NEW.close IS DISTINCT FROM OLD.close OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.symbol IS DISTINCT FROM OLD.symbol OR NEW.trade_date IS DISTINCT FROM OLD.trade_date THEN
    NEW.close_written_at := clock_timestamp();
  ELSE
    -- 같은 값을 다시 upsert해도(매 run의 7거래일 range 재적재) 기존 시각을 유지한다.
    NEW.close_written_at := OLD.close_written_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_stock_daily_price_close_written_at()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stamp_stock_daily_price_close_written_at
  BEFORE INSERT OR UPDATE ON public.stock_daily_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_stock_daily_price_close_written_at();

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

  SELECT trade_date, close, source
  INTO v_base_trade_date, v_base_close, v_base_source
  FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI'
    AND trade_date <= v_forecast.origin_date
    AND COALESCE(close_written_at, created_at) <= v_forecast.forecast_cutoff
  ORDER BY trade_date DESC
  LIMIT 1;

  IF v_base_trade_date IS NULL OR v_base_trade_date IS DISTINCT FROM v_forecast.origin_date THEN
    RAISE EXCEPTION 'enrollment requires a tradable Monday KOSPI base close at the forecast cutoff'
      USING ERRCODE = '55000';
  END IF;

  SELECT trade_date, close, source
  INTO v_lookback_trade_date, v_lookback_close, v_lookback_source
  FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI'
    AND trade_date <= v_base_trade_date
    AND COALESCE(close_written_at, created_at) <= v_forecast.forecast_cutoff
  ORDER BY trade_date DESC
  OFFSET 20
  LIMIT 1;

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
  ];
  v_source_ids_json := to_jsonb(v_source_ids);
  v_input_values := ARRAY[
    v_source_ids[1] || '|' || v_base_close::text,
    v_source_ids[2] || '|' || v_lookback_close::text
  ];
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
