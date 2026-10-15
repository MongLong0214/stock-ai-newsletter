-- 067 close_written_at 트리거 의미 검증. service_role로 실행해 트리거 함수 EXECUTE 회수가 쓰기를 막지 않음도 확인한다.
GRANT ALL ON public.stock_daily_prices TO service_role;
SET ROLE service_role;

CREATE TEMP TABLE probe_log (probe TEXT PRIMARY KEY, observed JSONB NOT NULL);
GRANT ALL ON probe_log TO service_role;

DO $probe$
DECLARE
  v_written TIMESTAMPTZ;
  v_created TIMESTAMPTZ;
  v_after_created TIMESTAMPTZ;
  v_before TIMESTAMPTZ;
BEGIN
  -- legacy(067 이전) 행은 NULL을 유지해 created_at만이 증거다.
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  IF v_written IS NOT NULL THEN RAISE EXCEPTION 'legacy row was backfilled: %', v_written; END IF;

  -- 같은 값 재적재(volume만 변경)는 NULL 유지.
  INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source)
  VALUES ('KOSPI', DATE '2026-08-31', 2800, 2, 'kis')
  ON CONFLICT (symbol, trade_date) DO UPDATE SET close = EXCLUDED.close, volume = EXCLUDED.volume, source = EXCLUDED.source;
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  IF v_written IS NOT NULL THEN RAISE EXCEPTION 'same-value upsert stamped a legacy row'; END IF;

  -- legacy NULL 행의 유일한 증거인 created_at을 과거로 바꿔 cutoff를 통과시킬 수 없어야 한다.
  SELECT created_at INTO v_created FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  UPDATE public.stock_daily_prices SET created_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  SELECT close_written_at, created_at INTO v_written, v_after_created FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  IF v_after_created IS DISTINCT FROM v_created OR v_written IS NOT NULL THEN
    RAISE EXCEPTION 'caller changed legacy created_at evidence';
  END IF;
  INSERT INTO probe_log VALUES ('legacy_created_at_update_ignored', jsonb_build_object('kept', true));

  -- 종가가 바뀌면 지금 시각으로 기록된다(phantom → 실제 종가 덮어쓰기 재현).
  INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source)
  VALUES ('KOSPI', DATE '2026-08-31', 2810, 2, 'kis')
  ON CONFLICT (symbol, trade_date) DO UPDATE SET close = EXCLUDED.close, volume = EXCLUDED.volume, source = EXCLUDED.source;
  SELECT close_written_at, created_at INTO v_written, v_created FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-08-31';
  IF v_written IS NULL OR v_written <= v_created OR v_written < now() - INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'changed close was not stamped now: written=% created=%', v_written, v_created;
  END IF;
  INSERT INTO probe_log VALUES ('changed_close_stamps_now', jsonb_build_object('stamped', true));

  -- 호출자가 두 시각을 과거로 지정해도 실제 저장 시각을 위조할 수 없어야 한다.
  INSERT INTO public.stock_daily_prices (symbol, trade_date, close, source, created_at, close_written_at)
  VALUES ('KOSPI', DATE '2026-09-01', 100, 'kis', TIMESTAMPTZ '2026-09-01 16:35:00+09', TIMESTAMPTZ '2000-01-01 00:00:00+00');
  SELECT close_written_at, created_at INTO v_written, v_created FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS NULL
     OR v_written < now() - INTERVAL '1 minute'
     OR v_written > clock_timestamp() + INTERVAL '1 second'
     OR v_written = v_created
     OR v_written = TIMESTAMPTZ '2000-01-01 00:00:00+00'
  THEN
    RAISE EXCEPTION 'insert did not receive a server clock stamp: %', v_written;
  END IF;
  INSERT INTO probe_log VALUES ('insert_backdated_created_at_gets_clock_stamp', jsonb_build_object('clock_stamped', true));
  v_before := v_written;

  -- 같은 값(수치 표기만 다름) + 다른 volume/OHLC는 시각을 유지한다.
  UPDATE public.stock_daily_prices SET close = 100.000, volume = 77, open = 99, high = 101, low = 98
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'unchanged close moved close_written_at: %', v_written;
  END IF;
  INSERT INTO probe_log VALUES ('unchanged_close_keeps_time', jsonb_build_object('kept', true));

  -- INSERT 분기에서 새 시각이 생겨도 충돌한 기존 종가가 같으면 기존 증거를 유지해야 한다.
  PERFORM pg_sleep(0.01);
  INSERT INTO public.stock_daily_prices (symbol, trade_date, close, source, close_written_at)
  VALUES ('KOSPI', DATE '2026-09-01', 100, 'kis', TIMESTAMPTZ '2000-01-01 00:00:00+00')
  ON CONFLICT (symbol, trade_date) DO UPDATE
  SET close = EXCLUDED.close, source = EXCLUDED.source, close_written_at = EXCLUDED.close_written_at;
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'same-value upsert moved close_written_at: %', v_written;
  END IF;
  INSERT INTO probe_log VALUES ('same_value_upsert_keeps_stamp', jsonb_build_object('kept', true));

  -- source만 바뀌어도 기록된다(provenance id에 source가 들어간다).
  PERFORM pg_sleep(0.01);
  UPDATE public.stock_daily_prices SET source = 'naver_backfill'
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS NULL OR v_written <= v_before THEN RAISE EXCEPTION 'source change was not stamped'; END IF;
  INSERT INTO probe_log VALUES ('source_change_stamps_now', jsonb_build_object('stamped', true));
  v_before := v_written;

  -- source가 같아도 종가 자체가 바뀌면 이전 저장 시각은 현재 종가의 증거가 아니다.
  PERFORM pg_sleep(0.01);
  UPDATE public.stock_daily_prices SET close = 101
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS NULL OR v_written <= v_before THEN RAISE EXCEPTION 'close change was not stamped'; END IF;
  INSERT INTO probe_log VALUES ('close_change_stamps_now', jsonb_build_object('stamped', true));
  v_before := v_written;

  -- 호출자가 close_written_at을 직접 써도 트리거가 덮어쓴다.
  UPDATE public.stock_daily_prices SET close_written_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  IF v_written IS DISTINCT FROM v_before OR v_written = TIMESTAMPTZ '2000-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'caller changed close_written_at without changing close/source: %', v_written;
  END IF;
  INSERT INTO probe_log VALUES ('caller_cannot_backdate_update', jsonb_build_object('kept', true));

  -- 다른 날짜로 옮겨진 관측은 원래 날짜에서 얻은 시각을 증거로 재사용할 수 없어야 한다.
  PERFORM pg_sleep(0.01);
  UPDATE public.stock_daily_prices SET trade_date = DATE '2026-09-02'
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-02';
  IF v_written IS NULL OR v_written <= v_before THEN RAISE EXCEPTION 'trade_date change was not stamped'; END IF;
  INSERT INTO probe_log VALUES ('trade_date_change_stamps_now', jsonb_build_object('stamped', true));
  v_before := v_written;

  -- 다른 종목으로 옮겨진 관측도 원래 종목의 저장 시각을 증거로 쓸 수 없어야 한다.
  PERFORM pg_sleep(0.01);
  UPDATE public.stock_daily_prices SET symbol = 'PROBE'
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-02';
  SELECT close_written_at, created_at INTO v_written, v_created FROM public.stock_daily_prices
  WHERE symbol = 'PROBE' AND trade_date = DATE '2026-09-02';
  IF v_written IS NULL OR v_written <= v_before THEN RAISE EXCEPTION 'symbol change was not stamped'; END IF;
  INSERT INTO probe_log VALUES ('symbol_change_stamps_now', jsonb_build_object('stamped', true));
  v_before := v_written;

  -- 생성 시각만 고치려는 호출은 기존 생성 시각과 종가 증거를 모두 보존해야 한다.
  UPDATE public.stock_daily_prices SET created_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
  WHERE symbol = 'PROBE' AND trade_date = DATE '2026-09-02';
  SELECT close_written_at, created_at INTO v_written, v_after_created FROM public.stock_daily_prices
  WHERE symbol = 'PROBE' AND trade_date = DATE '2026-09-02';
  IF v_after_created IS DISTINCT FROM v_created OR v_written IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'caller changed created_at or close_written_at evidence';
  END IF;
  INSERT INTO probe_log VALUES ('created_at_update_ignored', jsonb_build_object('kept', true));
END;
$probe$;

SELECT jsonb_object_agg(probe, observed) FROM probe_log;
