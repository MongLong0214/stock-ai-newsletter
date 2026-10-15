import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/067_tli_kospi_series_attestation.sql'
const sql = readFileSync(migrationPath, 'utf8')
const uncommented = sql.replace(/--[^\n]*/g, '')
const normalized = uncommented.replace(/\s+/g, ' ').trim()
const original049 = readFileSync('supabase/migrations/049_tli_experiment_cycles.sql', 'utf8')
const functionDefinition = (text: string, name: string): string => {
  const start = text.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`))
  expect(start).toBeGreaterThanOrEqual(0)
  return text.slice(start, text.indexOf('\n$$;', start) + 4)
}
const enroll = functionDefinition(sql, 'enroll_tli_origin')

describe('KOSPI single-response series attestation migration (067)', () => {
  it('is one transaction and leaves the mutable stock price cache untouched', () => {
    expect(normalized).toMatch(/^BEGIN; SET LOCAL lock_timeout = '5s';/)
    expect(normalized).toMatch(/COMMIT;$/)
    expect(uncommented).not.toMatch(/\bstock_daily_prices\b|close_written_at|restamp_stock_daily|stamp_stock_daily/)
    expect(existsSync('supabase/migrations/067_stock_daily_prices_close_provenance.sql')).toBe(false)
  })

  it('stores one append-only response and server attestation with exact read-only table access', () => {
    expect(normalized).toContain("source TEXT NOT NULL CHECK (source = 'kis')")
    for (const column of ['request_start DATE', 'request_end DATE', 'finalized_through DATE', 'trade_dates DATE[]', 'closes NUMERIC[]', 'payload_sha256 TEXT', 'recorded_at TIMESTAMPTZ', 'attested_at TIMESTAMPTZ']) {
      expect(normalized).toContain(`${column} NOT NULL`)
    }
    expect(normalized).toContain('REFERENCES public.tli_kospi_close_series(id) ON DELETE RESTRICT')
    expect(normalized).toContain('cardinality(trade_dates) = cardinality(closes) AND cardinality(trade_dates) >= 21')
    expect(normalized).toContain('trade_dates[cardinality(trade_dates)] = finalized_through')
    expect(normalized).toContain("0 < ALL (closes) AND 'Infinity'::NUMERIC > ALL (closes)")
    expect(normalized).toContain('array_position(trade_dates, NULL) IS NULL AND array_position(closes, NULL) IS NULL')
    for (const table of ['tli_kospi_close_series', 'tli_kospi_close_series_attestations']) {
      expect(normalized).toContain(`CREATE TABLE public.${table}`)
      expect(normalized).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(normalized).toContain(`BEFORE UPDATE OR DELETE OR TRUNCATE ON public.${table} FOR EACH STATEMENT EXECUTE FUNCTION public.reject_tli_append_only_mutation()`)
      expect(normalized).toContain(`ON public.${table} FOR SELECT TO service_role USING (true)`)
    }
    expect(normalized).toContain('REVOKE ALL ON TABLE public.tli_kospi_close_series, public.tli_kospi_close_series_attestations FROM PUBLIC, anon, authenticated, service_role;')
    expect(normalized).toContain('GRANT SELECT ON TABLE public.tli_kospi_close_series, public.tli_kospi_close_series_attestations TO service_role;')
  })

  it('validates ordered paired arrays and computes canonical payload hash and recorded_at itself', () => {
    const record = functionDefinition(sql, 'record_tli_kospi_close_series')
    expect(record).toContain('p_trade_dates[v_index] <= p_trade_dates[v_index - 1]')
    expect(record).toContain('cardinality(p_trade_dates) < 21')
    expect(record).toContain('cardinality(p_trade_dates) <> cardinality(p_closes)')
    expect(record).toContain('p_finalized_through > p_request_end')
    expect(record).toContain('p_trade_dates[cardinality(p_trade_dates)] IS DISTINCT FROM p_finalized_through')
    expect(record).toContain('p_closes[v_index] <= 0')
    expect(record).toContain("p_closes[v_index]::text IN ('NaN','Infinity','-Infinity')")
    expect(record).toContain("trim_scale(p_closes[i])::text")
    expect(record).toContain("encode(digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex')")
    expect(record).toContain('p_closes, v_sha, clock_timestamp()')
    expect(record).not.toMatch(/p_payload_sha256|p_recorded_at|ON CONFLICT|WHERE.*payload_sha256/)
    expect(record).toContain('kis|<YYYY-MM-DD,... in array order>|<close,... in array order>')
  })

  it('requires visible series from another transaction and timestamps attestation on the server', () => {
    const attest = functionDefinition(sql, 'attest_tli_kospi_close_series')
    expect(attest).toContain('SELECT * INTO v_series FROM public.tli_kospi_close_series WHERE id = p_series_id;')
    expect(attest).toContain('IF NOT FOUND OR v_series.recorded_at >= now() THEN')
    expect(attest).toContain("USING ERRCODE = '55000'")
    expect(attest).toContain('VALUES (v_series.id, v_series.payload_sha256, clock_timestamp())')
    expect(attest).toContain('attested_at >= statement snapshot time >= series commit time')
    expect(attest).not.toMatch(/p_attested_at|track_commit_timestamp|pg_xact_commit_timestamp/)
    for (const [name, signature] of [
      ['record_tli_kospi_close_series', 'DATE, DATE, DATE, DATE[], NUMERIC[]'],
      ['attest_tli_kospi_close_series', 'UUID'],
    ]) {
      expect(functionDefinition(sql, name)).toContain('SECURITY DEFINER\nSET search_path = public, extensions')
      expect(normalized).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(${signature}) FROM PUBLIC, anon, authenticated;`)
      expect(normalized).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO service_role;`)
    }
  })

  it('selects the latest eligible attestation and pins both closes and the full series to the input hash', () => {
    expect(enroll).toContain('WHERE series.finalized_through = v_forecast.origin_date')
    expect(enroll).toContain('AND attestation.attested_at <= v_forecast.forecast_cutoff')
    expect(enroll).toContain('ORDER BY attestation.attested_at DESC, series.id ASC')
    expect(enroll).toContain('series.trade_dates[cardinality(series.trade_dates) - 20]')
    expect(enroll).toContain('series.closes[cardinality(series.closes) - 20]')
    expect(enroll).toContain("ARRAY['KOSPI_SERIES|' || series.id::text || '|' || series.payload_sha256]")
    expect(enroll).toContain('] || v_source_ids;')
    expect(enroll).toContain('] || v_source_ids[3];')
    expect(enroll).not.toMatch(/stock_daily_prices|OFFSET 20/)
    expect(enroll).toContain("'KOSPI 20-trading-day lookback is unavailable at the forecast cutoff'")
    expect(normalized).toContain('jsonb_array_length(kospi_source_ids) IN (2, 3)')
  })

  it('keeps 049 byte-identical outside KOSPI selection/provenance including its signature and preserves ACLs', () => {
    const omitKospi = (definition: string, start: string): string => {
      const begin = definition.indexOf(start)
      const end = definition.indexOf('  IF v_base_close IS NULL', begin)
      const selectionRemoved = definition.slice(0, begin) + '<KOSPI selection>\n' + definition.slice(end)
      const provenanceBegin = selectionRemoved.indexOf('  v_source_ids := ARRAY[')
      const provenanceEnd = selectionRemoved.indexOf('  v_input_sha :=', provenanceBegin)
      return selectionRemoved.slice(0, provenanceBegin) + '<KOSPI provenance>\n' + selectionRemoved.slice(provenanceEnd)
    }
    expect(omitKospi(enroll, '  -- One attested KIS response')).toBe(
      omitKospi(functionDefinition(original049, 'enroll_tli_origin'), '  SELECT trade_date, close, source'),
    )
    expect(uncommented).not.toMatch(/(?:REVOKE|GRANT)[^;]*enroll_tli_origin/)
  })

  it('ships the PostgreSQL rehearsal inputs and required executable negative/positive probes', () => {
    const harness = readFileSync('scripts/tli/e2e/rehearse-migration-067.sh', 'utf8')
    expect(harness).toContain('DB_IMAGE=postgres:17')
    expect(harness).toContain('ON_ERROR_STOP=1')
    expect(harness).toContain(migrationPath)
    expect(harness).toContain('only KOSPI selection/provenance blocks changed')
    const inputs = [...harness.matchAll(/< (scripts\/tli\/e2e\/sql\/migration-067-[\w-]+\.sql)/g)].map((match) => match[1])
    expect(inputs.length).toBeGreaterThan(0)
    const probes = inputs.map((path) => readFileSync(path, 'utf8')).join('\n')
    for (const name of [
      'record_unsorted_rejected', 'record_duplicate_rejected', 'record_under_21_rejected',
      'record_last_date_mismatch_rejected', 'record_zero_close_rejected', 'record_nan_close_rejected',
      'record_mismatched_lengths_rejected', 'recorded_at_server_time', 'payload_sha256_recomputed_server_side',
      'same_transaction_attest_rejected_55000', 'later_transaction_attest_succeeds_after_record',
      'new_table_acls_and_rls_exact', 'rpc_acls_and_security_exact', 'stock_daily_prices_columns_and_triggers_unchanged',
      'enroll_attested_before_cutoff_exact_series_values_and_hash', 'enroll_interior_cache_hole_keeps_21st_from_last',
      'enroll_spurious_cache_rows_keep_response_calendar', 'enroll_without_any_stock_daily_prices_kospi_rows',
      'enroll_only_post_cutoff_attestation_rejected_55000', 'enroll_recorded_before_but_attested_after_cutoff_rejected_55000',
      'enroll_latest_pre_cutoff_attestation_wins', 'enroll_wrong_last_date_not_used_55000',
    ]) expect(probes).toContain(name)
    expect(harness).toContain('jsonb_object_agg(probe, passed ORDER BY probe)')
    expect(probes).not.toContain('close_written_at')
    expect(existsSync('scripts/tli/e2e/sql/migration-067-upsert-benchmark.sql')).toBe(false)
    expect(existsSync('scripts/tli/e2e/sql/migration-067-stock-close-provenance.sql')).toBe(false)
  })
})
