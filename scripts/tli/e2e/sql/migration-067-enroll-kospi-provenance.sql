-- Privileged fixtures below supply historical timestamps only to test enrollment.
-- RPC time/commit behavior is exercised without bypasses in the companion probe.
\set ON_ERROR_STOP on
SET statement_timeout = '30s';
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
SELECT ('f0000000-0000-4000-8000-00000000000' || n)::uuid, 'forecast-origin-v1', d, ((d + TIME '18:00') AT TIME ZONE 'Asia/Seoul'),
  jsonb_build_array('00000000-0000-4000-8000-000000000001'), 1, repeat(n::text, 64), repeat(n::text, 64), repeat(n::text, 64)
FROM (VALUES (1, DATE '2026-09-14'), (2, DATE '2026-09-21'), (3, DATE '2026-09-28'), (4, DATE '2026-10-05'), (5, DATE '2026-10-12'), (6, DATE '2026-10-19')) AS v(n, d);

INSERT INTO public.tli_study_origin_manifests (id, study_contract_id, forecast_origin_manifest_id, payload_sha256)
SELECT ('50000000-0000-4000-8000-00000000000' || n)::uuid, '20000000-0000-4000-8000-000000000015',
  ('f0000000-0000-4000-8000-00000000000' || n)::uuid, repeat(n::text, 64)
FROM generate_series(1, 6) AS n;

COMMIT;

CREATE FUNCTION migration_067_rehearsal.seed_series(
  p_id UUID, p_last DATE, p_level NUMERIC, p_recorded TIMESTAMPTZ, p_attested TIMESTAMPTZ
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE d DATE[]; c NUMERIC[]; h TEXT;
BEGIN
  SELECT array_agg(trade_date ORDER BY trade_date) INTO d FROM (
    SELECT day::date AS trade_date
    FROM generate_series(p_last - 90, p_last, INTERVAL '1 day') AS days(day)
    WHERE extract(isodow FROM day) <= 5 ORDER BY day DESC LIMIT 31
  ) AS response;
  SELECT array_agg(p_level + i ORDER BY i) INTO c FROM generate_series(1, cardinality(d)) AS points(i);
  SELECT encode(extensions.digest(convert_to('kis|' ||
    string_agg(to_char(d[i], 'YYYY-MM-DD'), ',' ORDER BY i) || '|' ||
    string_agg(trim_scale(c[i])::text, ',' ORDER BY i), 'UTF8'), 'sha256'), 'hex') INTO h
  FROM generate_subscripts(d, 1) AS points(i);
  INSERT INTO public.tli_kospi_close_series
    (id, source, request_start, request_end, finalized_through, trade_dates, closes, payload_sha256, recorded_at)
  VALUES (p_id, 'kis', p_last - 90, p_last, p_last, d, c, h, p_recorded);
  INSERT INTO public.tli_kospi_close_series_attestations (series_id, payload_sha256, attested_at)
  VALUES (p_id, h, p_attested);
  RETURN p_id;
END $$;

SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000001', '2026-09-14', 1000,
  '2026-09-14 16:35+09', '2026-09-14 17:00+09');
-- A later, post-cutoff attestation of the same response must not hide the eligible one.
INSERT INTO public.tli_kospi_close_series_attestations (series_id, payload_sha256, attested_at)
SELECT id, payload_sha256, TIMESTAMPTZ '2026-09-14 19:00+09' FROM public.tli_kospi_close_series
WHERE id = '60000000-0000-4000-8000-000000000001';
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000002', '2026-09-21', 2000,
  '2026-09-21 18:01+09', '2026-09-21 18:02+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000003', '2026-09-28', 3000,
  '2026-09-28 16:35+09', '2026-09-28 18:01+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000004', '2026-10-05', 4000,
  '2026-10-05 16:35+09', '2026-10-05 17:00+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000014', '2026-10-05', 5000,
  '2026-10-05 16:36+09', '2026-10-05 17:59+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000005', '2026-10-09', 6000,
  '2026-10-09 16:35+09', '2026-10-09 17:00+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000006', '2026-10-19', 7000,
  '2026-10-19 16:35+09', '2026-10-19 17:59+09');
SELECT migration_067_rehearsal.seed_series('60000000-0000-4000-8000-000000000016', '2026-10-19', 8000,
  '2026-10-19 16:36+09', '2026-10-19 17:59+09');

CREATE FUNCTION migration_067_rehearsal.assert_enroll(p_n INTEGER, p_series_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_id UUID; s public.tli_kospi_close_series%ROWTYPE; v_ids TEXT[];
BEGIN
  SELECT * INTO s FROM public.tli_kospi_close_series WHERE id = p_series_id;
  v_id := public.enroll_tli_origin('12000012-0000-4000-8000-000000000012',
    ('50000000-0000-4000-8000-00000000000' || p_n)::uuid,
    ('f0000000-0000-4000-8000-00000000000' || p_n)::uuid);
  v_ids := ARRAY[
    'KOSPI|' || to_char(s.finalized_through, 'YYYY-MM-DD') || '|kis',
    'KOSPI|' || to_char(s.trade_dates[cardinality(s.trade_dates) - 20], 'YYYY-MM-DD') || '|kis',
    'KOSPI_SERIES|' || s.id::text || '|' || s.payload_sha256
  ];
  IF NOT EXISTS (
    SELECT 1 FROM public.tli_experiment_origin_manifests WHERE id = v_id
      AND kospi_base_trade_date = s.finalized_through AND kospi_base_close = s.closes[cardinality(s.closes)]
      AND kospi_lookback_trade_date = s.trade_dates[cardinality(s.trade_dates) - 20]
      AND kospi_lookback_close = s.closes[cardinality(s.closes) - 20]
      AND kospi_source_ids = to_jsonb(v_ids)
      AND kospi_input_sha256 = public.tli_sha256_ordered_json_string_array(ARRAY[
        v_ids[1] || '|' || s.closes[cardinality(s.closes)]::text,
        v_ids[2] || '|' || s.closes[cardinality(s.closes) - 20]::text,
        v_ids[3]
      ])
      AND regime = CASE
        WHEN s.closes[cardinality(s.closes)] / s.closes[cardinality(s.closes) - 20] - 1 <= -0.03 THEN 'risk_off'
        WHEN s.closes[cardinality(s.closes)] / s.closes[cardinality(s.closes) - 20] - 1 >= 0.03 THEN 'risk_on'
        ELSE 'neutral' END
  ) THEN RAISE EXCEPTION 'enrollment did not pin the exact series base/lookback/source ids/hash/regime'; END IF;
END $$;

-- The mutable cache deliberately disagrees with every response close/source.
INSERT INTO public.stock_daily_prices (symbol, trade_date, close, source, created_at)
SELECT 'KOSPI', day::date, 17, 'naver_backfill', TIMESTAMPTZ '2026-01-01 00:00+00'
FROM generate_series(DATE '2026-06-01', DATE '2026-10-19', INTERVAL '1 day') AS days(day)
WHERE extract(isodow FROM day) <= 5
ON CONFLICT (symbol, trade_date) DO UPDATE SET close = EXCLUDED.close, source = EXCLUDED.source;

DO $$
DECLARE v_variant INTEGER; v_probe TEXT;
BEGIN
  FOR v_variant IN 1..4 LOOP
    IF v_variant = 2 THEN
      DELETE FROM public.stock_daily_prices WHERE symbol = 'KOSPI' AND trade_date = DATE '2026-09-01';
    ELSIF v_variant = 3 THEN
      INSERT INTO public.stock_daily_prices (symbol, trade_date, close, source)
      VALUES ('KOSPI', '2026-09-01', 17, 'naver_backfill'),
             ('KOSPI', '2026-09-13', 99999, 'naver_backfill');
    ELSIF v_variant = 4 THEN
      DELETE FROM public.stock_daily_prices WHERE symbol = 'KOSPI';
    END IF;
    BEGIN
      PERFORM migration_067_rehearsal.assert_enroll(1, '60000000-0000-4000-8000-000000000001');
      -- Only this sentinel rolls back the successful enrollment for the next variant.
      RAISE EXCEPTION 'successful enrollment probe' USING ERRCODE = 'P0670';
    EXCEPTION WHEN SQLSTATE 'P0670' THEN NULL;
    END;
    v_probe := CASE v_variant
      WHEN 1 THEN 'enroll_attested_before_cutoff_exact_series_values_and_hash'
      WHEN 2 THEN 'enroll_interior_cache_hole_keeps_21st_from_last'
      WHEN 3 THEN 'enroll_spurious_cache_rows_keep_response_calendar'
      WHEN 4 THEN 'enroll_without_any_stock_daily_prices_kospi_rows' END;
    INSERT INTO migration_067_rehearsal.results VALUES (v_probe, true);
  END LOOP;
END $$;

DO $$
DECLARE n INTEGER;
BEGIN
  FOREACH n IN ARRAY ARRAY[2, 3, 5] LOOP
    BEGIN
      PERFORM public.enroll_tli_origin('12000012-0000-4000-8000-000000000012',
        ('50000000-0000-4000-8000-00000000000' || n)::uuid,
        ('f0000000-0000-4000-8000-00000000000' || n)::uuid);
      RAISE EXCEPTION 'ineligible series unexpectedly enrolled for case %', n;
    EXCEPTION WHEN SQLSTATE '55000' THEN
      IF SQLERRM IS DISTINCT FROM 'enrollment requires a tradable Monday KOSPI base close at the forecast cutoff' THEN
        RAISE EXCEPTION 'wrong enrollment rejection: %', SQLERRM;
      END IF;
    END;
    INSERT INTO migration_067_rehearsal.results VALUES (CASE n
      WHEN 2 THEN 'enroll_only_post_cutoff_attestation_rejected_55000'
      WHEN 3 THEN 'enroll_recorded_before_but_attested_after_cutoff_rejected_55000'
      WHEN 5 THEN 'enroll_wrong_last_date_not_used_55000' END, true);
  END LOOP;
END $$;
SELECT migration_067_rehearsal.assert_enroll(4, '60000000-0000-4000-8000-000000000014');
INSERT INTO migration_067_rehearsal.results VALUES ('enroll_latest_pre_cutoff_attestation_wins', true);
SELECT migration_067_rehearsal.assert_enroll(6, '60000000-0000-4000-8000-000000000006');
INSERT INTO migration_067_rehearsal.results VALUES ('enroll_attestation_tie_series_id_ascending', true);
