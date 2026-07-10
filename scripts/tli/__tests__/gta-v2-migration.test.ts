import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase/migrations/048_tli_gta_v2.sql')

let sql = ''
let normalizedSql = ''
/** SQL with `--` line comments stripped, for negative assertions that must ignore prose. */
let executableSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  executableSql = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
})

describe('TLI gta-v2 migration', () => {
  it('applies the entire label contract atomically', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
  })

  it('adds the exact gta-v2 provenance columns wired to the Todo 4 foundation/source tables', () => {
    for (const fragment of [
      'ADD COLUMN IF NOT EXISTS past_dates JSONB',
      'ADD COLUMN IF NOT EXISTS future_dates JSONB',
      'ADD COLUMN IF NOT EXISTS forecast_origin_manifest_id UUID REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT',
      'ADD COLUMN IF NOT EXISTS forecast_interest_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'ADD COLUMN IF NOT EXISTS label_source_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'ADD COLUMN IF NOT EXISTS source_cutoff TIMESTAMPTZ',
      'ADD COLUMN IF NOT EXISTS source_max_date DATE',
      'ADD COLUMN IF NOT EXISTS label_request_sha256 TEXT',
      'ADD COLUMN IF NOT EXISTS label_response_sha256 TEXT',
      'ADD COLUMN IF NOT EXISTS past_observation_count INTEGER',
      'ADD COLUMN IF NOT EXISTS future_observation_count INTEGER',
      'ADD COLUMN IF NOT EXISTS forecast_keyword_group_sha256 TEXT',
    ]) {
      expect(normalizedSql).toContain(fragment)
    }
    for (const column of ['label_request_sha256', 'label_response_sha256', 'forecast_keyword_group_sha256']) {
      expect(normalizedSql).toContain(`${column} IS NULL OR ${column} ~ '^[0-9a-f]{64}$'`)
    }
  })

  it('puts labeler_version in the unique key while preserving v1 rows', () => {
    expect(normalizedSql).toContain(
      'DROP CONSTRAINT IF EXISTS theme_labels_theme_id_base_date_label_type_horizon_days_key',
    )
    expect(normalizedSql).toContain(
      'ADD CONSTRAINT theme_labels_identity_key UNIQUE (theme_id, base_date, label_type, horizon_days, labeler_version)',
    )
    // v1 rows are neither deleted nor their gta-v1 lock dropped.
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.theme_labels/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT[^;]*theme_labels_gta_v1_scientific_use_check/i)
  })

  it('extends the scientific-use transitions for gta-v2 exactly', () => {
    expect(normalizedSql).toContain("labeler_version <> 'gta-v2'")
    expect(normalizedSql).toContain(
      "label_status = 'pending' AND scientific_use_status = 'exploratory_only' AND scientific_use_reason = 'pending_gta_v2'",
    )
    expect(normalizedSql).toContain(
      "label_status = 'final' AND scientific_use_status = 'confirmatory_eligible' AND scientific_use_reason = 'gta_v2_exact_contract'",
    )
    expect(normalizedSql).toContain(
      "label_status = 'excluded' AND scientific_use_status = 'exploratory_only' AND scientific_use_reason IN ('zero_denominator','source_gap_sla','spec_mismatch')",
    )
  })

  it('requires the exact 5+5 provenance and a positive denominator on final rows', () => {
    for (const fragment of [
      'NOT (labeler_version = \'gta-v2\' AND label_status = \'final\')',
      'forecast_origin_manifest_id IS NOT NULL',
      'forecast_interest_run_id IS NOT NULL',
      'label_source_run_id IS NOT NULL',
      'past_dates IS NOT NULL AND jsonb_array_length(past_dates) = 5',
      'future_dates IS NOT NULL AND jsonb_array_length(future_dates) = 5',
      'past_observation_count = 5',
      'future_observation_count = 5',
      'denominator IS NOT NULL AND denominator > 0',
      'g_log_ratio IS NOT NULL AND g_log_ratio >= -1.5 AND g_log_ratio <= 1.5',
      'rescale_suspect = false',
    ]) {
      expect(normalizedSql).toContain(fragment)
    }
  })

  it('requires a forecast manifest whose origin_date equals base_date with a matching child on INSERT', () => {
    expect(normalizedSql).toContain('BEFORE INSERT ON public.theme_labels')
    expect(normalizedSql).toContain('manifest.origin_date = NEW.base_date')
    expect(normalizedSql).toContain('child.theme_id = NEW.theme_id')
    expect(normalizedSql).toContain('gta-v2 labels require a forecast origin manifest')
    expect(normalizedSql).toContain('legacy labels must leave gta-v2 provenance foreign keys null')
    // legacy path is gated on all three foreign keys being null.
    expect(normalizedSql).toContain(
      'NEW.forecast_origin_manifest_id IS NOT NULL OR NEW.forecast_interest_run_id IS NOT NULL OR NEW.label_source_run_id IS NOT NULL',
    )
  })

  it('permits only the finalizer to transition a pending gta-v2 row, once, and never delete it', () => {
    expect(normalizedSql).toContain('BEFORE UPDATE OR DELETE ON public.theme_labels')
    expect(normalizedSql).toContain('gta-v2 labels are permanent and cannot be deleted')
    expect(normalizedSql).toContain(
      "current_setting('tli.finalize_gta_v2_label_id', true) IS DISTINCT FROM OLD.id::text",
    )
    expect(normalizedSql).toContain('gta-v2 terminal labels cannot be re-adjudicated')
    expect(normalizedSql).toContain("NEW.label_status NOT IN ('final','excluded')")
    // legacy labels are exempt from the gta-v2 guard.
    expect(normalizedSql).toContain(
      "OLD.labeler_version <> 'gta-v2' AND NEW.labeler_version <> 'gta-v2'",
    )
  })

  it('finalizes through one fail-closed SECURITY DEFINER RPC over canonical bytes', () => {
    expect(normalizedSql).toContain(
      'CREATE OR REPLACE FUNCTION public.finalize_tli_gta_v2_label( p_label_canonical_json TEXT, p_payload_sha256 TEXT )',
    )
    expect(normalizedSql).toContain('SECURITY DEFINER')
    expect(normalizedSql).toContain(
      'public.tli_parse_canonical_json_v1(p_label_canonical_json, p_payload_sha256)',
    )
    expect(normalizedSql).toContain(
      "PERFORM set_config('tli.finalize_gta_v2_label_id', v_label.id::text, true)",
    )
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.finalize_tli_gta_v2_label(TEXT, TEXT) FROM PUBLIC, anon, authenticated',
    )
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.finalize_tli_gta_v2_label(TEXT, TEXT) TO service_role',
    )
  })

  it('derives exactly five past + five future trading dates and gates final on horizon source', () => {
    expect(normalizedSql).toContain("WHERE symbol = 'KOSPI' AND trade_date <= v_base_date")
    expect(normalizedSql).toContain("WHERE symbol = 'KOSPI' AND trade_date > v_base_date")
    expect(normalizedSql).toContain('v_past_dates[5] IS DISTINCT FROM v_base_date')
    expect(normalizedSql).toContain('v_source_run.source_max_date < v_horizon_date')
    // exactly five past observations from one response.
    expect(normalizedSql).toContain('v_past_count IS DISTINCT FROM 5')
    expect(normalizedSql).toContain('v_future_count < 5')
  })

  it('implements the exact denominator, y, and g_log_ratio contract with no floor or log threshold', () => {
    // eligibility is exactly past_sum > 0 (zero_denominator when it is zero).
    expect(normalizedSql).toContain('IF v_past_sum = 0 THEN')
    expect(normalizedSql).toContain("v_new_reason := 'zero_denominator'")
    // y = 1[ratio >= 1.10] via exact rational comparison, never a 0.10 log threshold.
    expect(normalizedSql).toContain('v_future_sum * 10 >= v_past_sum * 11')
    expect(executableSql).not.toMatch(/g_log_ratio\s*>=\s*0\.1\b/)
    expect(executableSql).not.toMatch(/(v_past_sum|v_past_mean|denominator)\s*(>=|>)\s*4\b/)
    expect(executableSql).not.toMatch(/(v_past_sum|v_past_mean|denominator)\s*<\s*4\b/)
    // future_mean=0 → g_log_ratio must be -1.5.
    expect(normalizedSql).toContain('gta-v2 g_log_ratio must be -1.5 when the future mean is zero')
    // eligibility never branches on the future-window maximum of the response values.
    expect(executableSql).not.toMatch(/max\(\s*normalized/i)
  })

  it('produces the three exact terminal exclusion codes', () => {
    for (const reason of ['zero_denominator', 'source_gap_sla', 'spec_mismatch']) {
      expect(normalizedSql).toContain(`v_new_reason := '${reason}'`)
    }
    // grace deadline is the third Korean trading date after the horizon at 18:00 KST.
    expect(normalizedSql).toContain("WHERE symbol = 'KOSPI' AND trade_date > v_horizon_date")
    expect(normalizedSql).toContain('LIMIT 3')
    expect(normalizedSql).toContain("(max(trade_date)::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul'")
    expect(normalizedSql).toContain('v_as_of < v_grace_deadline')
  })
})
