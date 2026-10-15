-- enroll_tli_origin의 KOSPI provenance가 "종가가 cutoff까지 실제 저장됨"(close_written_at)을 따르는지 검증한다.
-- 사이클·manifest 픽스처는 session_replication_role=replica로 직접 심고(트리거·FK 우회), enroll은 정상 모드로 호출한다.
-- origin 날짜가 rehearsal 실행 시각보다 과거여야 "cutoff 이후 덮어쓰기"를 재현할 수 있다(2026-09-14~10-05).
BEGIN;
SET LOCAL session_replication_role = replica;

INSERT INTO public.tli_attention_study_contracts (
  id, contract_version, locked_at, first_origin_date, babl_algorithm_version, babl_comparison_spec_version,
  babl_evaluation_horizon_days, babl_candidate_pool_rule, babl_control_row_id, babl_control_sha256,
  labeler_version, label_contract_sha256, feature_contract_version, feature_contract_sha256, payload_sha256,
  git_commit_sha, git_blob_sha, repo_relative_path, verifier_version, verifier_code_sha, verified_at)
VALUES (
  '20000000-0000-4000-8000-000000000015', 'tli-attention-study-v1', TIMESTAMPTZ '2026-09-01 00:00:00+00', DATE '2026-09-14',
  'comparison-v4-shadow-v1', 'comparison-v4-spec-v1', 14, 'source_prod_run_v1', '20000000-0000-4000-8000-000000000016', repeat('1', 64),
  'gta-v2', repeat('2', 64), 'tli-attention-v2-f1', repeat('3', 64), repeat('4', 64),
  repeat('5', 40), repeat('6', 40), 'docs/evidence/tli-v3-scientific-rebuild/studies/20000000-0000-4000-8000-000000000015/study-contract.json', 'v1', repeat('7', 64), TIMESTAMPTZ '2026-09-01 00:00:00+00');

INSERT INTO public.tli_experiment_cycles (
  id, status, study_contract_id, study_contract_sha256, candidate_model_version, candidate_model_sha256,
  comparator_version, comparator_artifact_sha256, planned_origins, safety_origins, calendar_start, initial_calendar_end,
  frozen_at, running_at, alpha, primary_endpoint)
VALUES (
  '12000012-0000-4000-8000-000000000012', 'running', '20000000-0000-4000-8000-000000000015', repeat('4', 64),
  'probe-candidate', repeat('a', 64), 'probe-comparator', repeat('b', 64), 16, 8, DATE '2026-09-07', DATE '2027-01-01',
  TIMESTAMPTZ '2026-09-02 00:00:00+00', TIMESTAMPTZ '2026-09-03 00:00:00+00', 0.01, 'paired_brier_delta');

INSERT INTO public.tli_forecast_origin_manifests (id, manifest_version, origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count,
  expected_universe_sha256, keyword_group_manifest_sha256, payload_sha256)
SELECT ('f0000000-0000-4000-8000-00000000000' || n)::uuid, 'forecast-origin-v1', d, ((d::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Seoul'),
  jsonb_build_array('00000000-0000-4000-8000-000000000001'), 1, repeat(n::text, 64), repeat(n::text, 64), repeat(n::text, 64)
FROM (VALUES (1, DATE '2026-09-14'), (2, DATE '2026-09-21'), (3, DATE '2026-09-28'), (4, DATE '2026-10-05')) AS v(n, d);

INSERT INTO public.tli_study_origin_manifests (id, study_contract_id, forecast_origin_manifest_id, payload_sha256)
SELECT ('50000000-0000-4000-8000-00000000000' || n)::uuid, '20000000-0000-4000-8000-000000000015',
  ('f0000000-0000-4000-8000-00000000000' || n)::uuid, repeat(n::text, 64)
FROM generate_series(1, 4) AS n;

-- legacy 경로의 정상 등록도 검증하려면 created_at이 cutoff 이전인 행이 필요하다.
INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source, created_at)
SELECT 'KOSPI', d::date, 2800, 1, 'kis', TIMESTAMPTZ '2026-08-01 00:00:00+00'
FROM generate_series(DATE '2026-07-01', DATE '2026-10-30', INTERVAL '1 day') AS days(d)
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
ON CONFLICT (symbol, trade_date) DO NOTHING;

-- legacy NULL의 created_at 역기재가 cutoff 증거를 위조하는지 확인하려면 늦게 생긴 행이 필요하다.
UPDATE public.stock_daily_prices SET created_at = TIMESTAMPTZ '2026-09-28 19:00:00+09'
WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-28';

-- cutoff 전에 이미 저장된 종가는 재적재 후에도 그 시각이 증거로 남아야 한다.
UPDATE public.stock_daily_prices SET close_written_at = TIMESTAMPTZ '2026-09-21 17:00:00+09'
WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-21';
COMMIT;

CREATE TEMP TABLE enroll_probe_log (probe TEXT PRIMARY KEY, observed JSONB NOT NULL);

-- legacy NULL은 created_at이 cutoff 전이면 기존 증거로 등록할 수 있어야 한다.
DO $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-14'
      AND close_written_at IS NULL AND created_at < TIMESTAMPTZ '2026-09-14 18:00:00+09'
  ) THEN RAISE EXCEPTION 'legacy base close has no pre-cutoff created_at evidence'; END IF;
  v_id := public.enroll_tli_origin('12000012-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001');
  INSERT INTO enroll_probe_log VALUES ('legacy_null_row_falls_back_to_created_at', jsonb_build_object('enrolled', v_id IS NOT NULL));
END $$;

-- 같은 값 재적재는 cutoff 전 종가의 저장 증거를 늦춰 등록을 막아서는 안 된다.
INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source)
VALUES ('KOSPI', DATE '2026-09-21', 2800, 99, 'kis')
ON CONFLICT (symbol, trade_date) DO UPDATE SET close = EXCLUDED.close, volume = EXCLUDED.volume, source = EXCLUDED.source;
DO $$
DECLARE v_id UUID; v_written TIMESTAMPTZ;
BEGIN
  SELECT close_written_at INTO v_written FROM public.stock_daily_prices
  WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-21';
  IF v_written IS DISTINCT FROM TIMESTAMPTZ '2026-09-21 17:00:00+09' THEN
    RAISE EXCEPTION 'same-value reupsert moved the pre-cutoff stamp: %', v_written;
  END IF;
  v_id := public.enroll_tli_origin('12000012-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002');
  INSERT INTO enroll_probe_log VALUES ('same_value_reupsert_keeps_pre_cutoff_stamp', jsonb_build_object('enrolled', v_id IS NOT NULL));
END $$;

-- legacy NULL 행의 유일한 증거를 역기재해도 cutoff 이후 관측이 등록되어서는 안 된다.
UPDATE public.stock_daily_prices SET created_at = TIMESTAMPTZ '2026-08-01 00:00:00+00'
WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-28';
DO $$
DECLARE v_state TEXT; v_msg TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_daily_prices
    WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-28'
      AND created_at = TIMESTAMPTZ '2026-09-28 19:00:00+09' AND close_written_at IS NULL
  ) THEN RAISE EXCEPTION 'caller backdated legacy created_at evidence'; END IF;
  BEGIN
    PERFORM public.enroll_tli_origin('12000012-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'backdated legacy created_at unexpectedly enrolled' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_msg NOT LIKE 'enrollment requires a tradable Monday KOSPI base close%' THEN RAISE EXCEPTION 'wrong rejection: %', v_msg; END IF;
  INSERT INTO enroll_probe_log VALUES ('legacy_created_at_backdate_rejected', jsonb_build_object('rejected', v_state = '55000'));
END $$;

-- cutoff 이후 종가가 덮어써진 행은 created_at과 무관하게 거부되어야 한다.
UPDATE public.stock_daily_prices SET close = 2850 WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-28';
DO $$
DECLARE v_state TEXT; v_msg TEXT;
BEGIN
  BEGIN
    PERFORM public.enroll_tli_origin('12000012-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'post-cutoff rewritten close unexpectedly enrolled' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  IF v_msg NOT LIKE 'enrollment requires a tradable Monday KOSPI base close%' THEN RAISE EXCEPTION 'wrong rejection: %', v_msg; END IF;
  INSERT INTO enroll_probe_log VALUES ('post_cutoff_close_rewrite_rejected', jsonb_build_object('sqlstate', v_state, 'message', v_msg));
END $$;

-- 두 시각을 cutoff 전으로 위조해도 실제로 늦게 저장한 종가는 등록할 수 없어야 한다.
DELETE FROM public.stock_daily_prices WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-10-05';
INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source, created_at, close_written_at)
VALUES ('KOSPI', DATE '2026-10-05', 2800, 1, 'kis', TIMESTAMPTZ '2026-10-05 09:00:00+09', TIMESTAMPTZ '2026-10-05 09:00:00+09');
DO $$
DECLARE v_state TEXT;
BEGIN
  BEGIN
    PERFORM public.enroll_tli_origin('12000012-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'backdated insert unexpectedly enrolled' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE '55000' THEN GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  INSERT INTO enroll_probe_log VALUES ('backdated_created_at_insert_rejected', jsonb_build_object('sqlstate', v_state));
END $$;

SELECT jsonb_object_agg(probe, observed) FROM enroll_probe_log;
