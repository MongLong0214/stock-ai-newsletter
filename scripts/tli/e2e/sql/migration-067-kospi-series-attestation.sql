\set ON_ERROR_STOP on
SET statement_timeout = '30s';

DO $$
DECLARE v_table TEXT; v_function REGPROCEDURE; v_acl TEXT[];
BEGIN
  FOREACH v_table IN ARRAY ARRAY['tli_kospi_close_series', 'tli_kospi_close_series_attestations'] LOOP
    SELECT array_agg(COALESCE(r.rolname::text, 'PUBLIC') || ':' || a.privilege_type ORDER BY 1)
    INTO v_acl
    FROM pg_class AS c, LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
    LEFT JOIN pg_roles AS r ON r.oid = a.grantee
    WHERE c.oid = ('public.' || v_table)::regclass AND a.grantee <> c.relowner;
    IF v_acl IS DISTINCT FROM ARRAY['service_role:SELECT'] THEN
      RAISE EXCEPTION 'wrong table ACL on %: %', v_table, v_acl;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass)
       OR (SELECT count(*) FROM pg_policy WHERE polrelid = ('public.' || v_table)::regclass) <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || v_table)::regclass
                      AND polcmd = 'r' AND polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'service_role')]) THEN
      RAISE EXCEPTION 'wrong RLS/policy on %', v_table;
    END IF;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'public.record_tli_kospi_close_series(date,date,date,date[],numeric[])'::regprocedure,
    'public.attest_tli_kospi_close_series(uuid)'::regprocedure,
    'public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure
  ] LOOP
    SELECT array_agg(COALESCE(r.rolname::text, 'PUBLIC') || ':' || a.privilege_type ORDER BY 1)
    INTO v_acl
    FROM pg_proc AS p, LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
    LEFT JOIN pg_roles AS r ON r.oid = a.grantee
    WHERE p.oid = v_function AND a.grantee <> p.proowner;
    IF v_acl IS DISTINCT FROM ARRAY['service_role:EXECUTE']
       OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_function AND prosecdef
                      AND proconfig = ARRAY['search_path=public, extensions']) THEN
      RAISE EXCEPTION 'wrong RPC ACL/security/search_path: % (%)', v_function, v_acl;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM migration_067_rehearsal.stock_cache_before AS b
    WHERE b.columns IS NOT DISTINCT FROM
      (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute AS a
       WHERE a.attrelid = 'public.stock_daily_prices'::regclass AND a.attnum > 0)
      AND b.triggers IS NOT DISTINCT FROM
      (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger AS t
       WHERE t.tgrelid = 'public.stock_daily_prices'::regclass AND NOT t.tgisinternal)
  ) THEN RAISE EXCEPTION '067 changed stock_daily_prices columns/triggers'; END IF;
END $$;
INSERT INTO migration_067_rehearsal.results VALUES
  ('new_table_acls_and_rls_exact', true), ('rpc_acls_and_security_exact', true),
  ('stock_daily_prices_columns_and_triggers_unchanged', true);

CREATE TEMP TABLE valid_points AS
SELECT ARRAY(SELECT d::date FROM generate_series(DATE '2026-08-04', DATE '2026-09-01', INTERVAL '1 day') AS days(d)
             WHERE extract(isodow FROM d) <= 5 ORDER BY d) AS dates,
       ARRAY(SELECT (100 + n)::numeric FROM generate_series(1, 21) AS points(n)) AS closes;
GRANT SELECT ON valid_points TO service_role;

DO $$
DECLARE d DATE[]; c NUMERIC[]; v_case RECORD;
BEGIN
  SELECT dates, closes INTO d, c FROM valid_points;
  FOR v_case IN SELECT * FROM (VALUES
    ('record_unsorted_rejected', ARRAY[d[2], d[1]] || d[3:21], c),
    ('record_duplicate_rejected', ARRAY[d[1], d[1]] || d[3:21], c),
    ('record_under_21_rejected', d[2:21], c[2:21]),
    ('record_last_date_mismatch_rejected', d, c),
    ('record_zero_close_rejected', d, ARRAY[0::numeric] || c[2:21]),
    ('record_negative_close_rejected', d, ARRAY[-1::numeric] || c[2:21]),
    ('record_nan_close_rejected', d, ARRAY['NaN'::numeric] || c[2:21]),
    ('record_infinite_close_rejected', d, ARRAY['Infinity'::numeric] || c[2:21]),
    ('record_negative_infinite_close_rejected', d, ARRAY['-Infinity'::numeric] || c[2:21]),
    ('record_mismatched_lengths_rejected', d, c[2:21]),
    ('record_null_date_rejected', ARRAY[NULL::date] || d[2:21], c),
    ('record_null_close_rejected', d, ARRAY[NULL::numeric] || c[2:21]),
    ('record_null_array_rejected', NULL::date[], c)
  ) AS cases(probe, dates, closes) LOOP
    BEGIN
      PERFORM public.record_tli_kospi_close_series('2026-08-04', '2026-09-02',
        CASE WHEN v_case.probe = 'record_last_date_mismatch_rejected' THEN DATE '2026-09-02' ELSE DATE '2026-09-01' END,
        v_case.dates, v_case.closes);
      RAISE EXCEPTION 'accepted invalid case %', v_case.probe;
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
    INSERT INTO migration_067_rehearsal.results VALUES (v_case.probe, true);
  END LOOP;
  BEGIN
    PERFORM public.record_tli_kospi_close_series('2026-08-04', '2026-08-31', '2026-09-01', d, c);
    RAISE EXCEPTION 'accepted finalized_through beyond request_end';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  INSERT INTO migration_067_rehearsal.results VALUES ('record_finalized_beyond_request_end_rejected', true);
  -- These arguments do not exist: neither timestamps nor a caller hash can enter the RPC.
  BEGIN
    EXECUTE 'SELECT public.record_tli_kospi_close_series(p_recorded_at => now(), p_payload_sha256 => repeat(''0'',64))';
    RAISE EXCEPTION 'RPC accepted caller timestamp/hash';
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  INSERT INTO migration_067_rehearsal.results VALUES ('record_no_caller_timestamp_or_hash_arguments', true);
END $$;

SELECT clock_timestamp() AS before_record \gset
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.record_tli_kospi_close_series('2026-08-04', '2026-09-01', '2026-09-01', dates, closes) AS series_id
FROM valid_points \gset
SELECT set_config('migration_067.series_id', :'series_id', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.attest_tli_kospi_close_series(current_setting('migration_067.series_id')::uuid);
    RAISE EXCEPTION 'same-transaction attestation accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;
COMMIT;
INSERT INTO migration_067_rehearsal.results VALUES ('same_transaction_attest_rejected_55000', true);

-- A new request/transaction sees the committed series, and may now attest it.
SET ROLE service_role;
SELECT public.attest_tli_kospi_close_series(:'series_id') AS attestation_id \gset
SELECT count(*) FROM public.tli_kospi_close_series;
SELECT count(*) FROM public.tli_kospi_close_series_attestations;
RESET ROLE;
SELECT set_config('migration_067.before_record', :'before_record', false);
SELECT set_config('migration_067.attestation_id', :'attestation_id', false);
DO $$
DECLARE s public.tli_kospi_close_series%ROWTYPE; a public.tli_kospi_close_series_attestations%ROWTYPE; v_sha TEXT;
        v_repeat UUID; v_decimal UUID;
BEGIN
  SELECT * INTO s FROM public.tli_kospi_close_series WHERE id = current_setting('migration_067.series_id')::uuid;
  SELECT * INTO a FROM public.tli_kospi_close_series_attestations WHERE id = current_setting('migration_067.attestation_id')::uuid;
  IF s.recorded_at < current_setting('migration_067.before_record')::timestamptz OR s.recorded_at > clock_timestamp() THEN
    RAISE EXCEPTION 'recorded_at is not server time';
  END IF;
  -- Independent expected bytes for the 21 known dates/closes, not a caller-supplied digest.
  SELECT encode(extensions.digest(convert_to('kis|' ||
    (SELECT string_agg(to_char(d::date, 'YYYY-MM-DD'), ',' ORDER BY d)
     FROM generate_series(DATE '2026-08-04', DATE '2026-09-01', INTERVAL '1 day') AS days(d)
     WHERE extract(isodow FROM d) <= 5) || '|' ||
    (SELECT string_agg((100 + n)::text, ',' ORDER BY n) FROM generate_series(1, 21) AS points(n)), 'UTF8'), 'sha256'), 'hex')
  INTO v_sha;
  IF s.payload_sha256 IS DISTINCT FROM v_sha OR a.payload_sha256 IS DISTINCT FROM v_sha
     OR a.series_id IS DISTINCT FROM s.id OR a.attested_at <= s.recorded_at THEN
    RAISE EXCEPTION 'hash/server time/committed attestation mismatch';
  END IF;
  v_repeat := public.record_tli_kospi_close_series(s.request_start, s.request_end, s.finalized_through, s.trade_dates, s.closes);
  SELECT public.record_tli_kospi_close_series(s.request_start, s.request_end, s.finalized_through, s.trade_dates,
    ARRAY(SELECT value::numeric(12,2) FROM unnest(s.closes) AS points(value))) INTO v_decimal;
  IF v_repeat = s.id OR v_decimal = s.id OR v_decimal = v_repeat
     OR (SELECT payload_sha256 FROM public.tli_kospi_close_series WHERE id = v_repeat) IS DISTINCT FROM v_sha
     OR (SELECT payload_sha256 FROM public.tli_kospi_close_series WHERE id = v_decimal) IS DISTINCT FROM v_sha THEN
    RAISE EXCEPTION 'identical/numerically equal payload was not appended with canonical hash';
  END IF;
  BEGIN
    PERFORM public.attest_tli_kospi_close_series('ffffffff-ffff-4fff-8fff-ffffffffffff');
    RAISE EXCEPTION 'missing series attested';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END $$;
INSERT INTO migration_067_rehearsal.results VALUES
  ('recorded_at_server_time', true), ('payload_sha256_recomputed_server_side', true),
  ('identical_payload_appends_new_rows', true), ('numeric_scale_canonical_hash', true),
  ('later_transaction_attest_succeeds_after_record', true), ('missing_series_attest_rejected_55000', true);

DO $$
DECLARE v_role TEXT; v_table TEXT; v_operation TEXT; v_sql TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['service_role', 'anon', 'authenticated'] LOOP
    FOREACH v_table IN ARRAY ARRAY['tli_kospi_close_series', 'tli_kospi_close_series_attestations'] LOOP
      FOREACH v_operation IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
        v_sql := CASE v_operation
          WHEN 'insert' THEN format('INSERT INTO public.%I DEFAULT VALUES', v_table)
          WHEN 'update' THEN format('UPDATE public.%I SET payload_sha256 = repeat(''0'',64)', v_table)
          WHEN 'delete' THEN format('DELETE FROM public.%I', v_table) END;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', v_role);
          EXECUTE v_sql;
          RAISE EXCEPTION 'direct % unexpectedly allowed for % on %', v_operation, v_role, v_table;
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END; -- The failed subtransaction restores the owner role before logging.
        INSERT INTO migration_067_rehearsal.results VALUES (v_role || '_' || v_table || '_' || v_operation || '_denied', true);
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['tli_kospi_close_series', 'tli_kospi_close_series_attestations'] LOOP
    FOREACH v_operation IN ARRAY ARRAY['update', 'delete'] LOOP
      BEGIN
        EXECUTE CASE v_operation
          WHEN 'update' THEN format('UPDATE public.%I SET payload_sha256 = payload_sha256', v_table)
          WHEN 'delete' THEN format('DELETE FROM public.%I', v_table)
          WHEN 'truncate' THEN format('TRUNCATE public.%I', v_table) END;
        RAISE EXCEPTION 'owner mutation unexpectedly allowed';
      EXCEPTION WHEN insufficient_privilege THEN
        IF SQLERRM IS DISTINCT FROM v_table || ' is append-only; UPDATE, DELETE, and TRUNCATE are forbidden' THEN
          RAISE EXCEPTION 'owner mutation rejected outside immutability trigger: %', SQLERRM;
        END IF;
      END;
      INSERT INTO migration_067_rehearsal.results VALUES ('owner_' || v_table || '_' || v_operation || '_trigger_rejected', true);
    END LOOP;
  END LOOP;
END $$;
