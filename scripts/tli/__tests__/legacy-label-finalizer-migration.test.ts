import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase/migrations/054_tli_legacy_label_finalizer.sql')
const rehearsalPath = join(process.cwd(), 'scripts/tli/e2e/rehearse-migration-054.sh')
const fixturePath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/migration-054-legacy-label-finalizer.sql',
)

let sql = ''
let normalizedSql = ''
let rehearsal = ''
let fixture = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  rehearsal = readFileSync(rehearsalPath, 'utf8')
  fixture = readFileSync(fixturePath, 'utf8').replace(/\s+/g, ' ').trim()
})

const functionSql = (): string => {
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.finalize_tli_legacy_labels\([\s\S]*?\n\$\$;/,
  )
  expect(match, 'missing finalize_tli_legacy_labels function').not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

describe('migration 054 legacy label finalizer', () => {
  it('is append-only, transaction-wrapped, and follows migrations 049 through 053', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)

    let previousOffset = -1
    for (const migration of [
      '049_tli_experiment_cycles.sql',
      '050_tli_collection_append_rpc_and_git_sha.sql',
      '051_tli_fix_observation_trigger_binding.sql',
      '052_tli_abstain_sentinel_db_guard.sql',
      '053_tli_label_guard_and_legacy_prediction_upsert.sql',
      '054_tli_legacy_label_finalizer.sql',
    ]) {
      const offset = rehearsal.indexOf(migration)
      expect(offset).toBeGreaterThan(previousOffset)
      previousOffset = offset
    }
  })

  it('updates only an exact pending identity and rejects partial or zero-row matches', () => {
    const body = functionSql()
    for (const predicate of [
      'label.id = input_row.id',
      'label.theme_id = input_row.theme_id',
      'label.base_date = input_row.base_date',
      'label.label_type = input_row.label_type',
      'label.horizon_days = input_row.horizon_days',
      'label.labeler_version = input_row.labeler_version',
      "label.label_status = 'pending'",
    ]) {
      expect(body).toContain(predicate)
    }
    expect(body).toContain('v_affected_count IS DISTINCT FROM v_requested_count')
    expect(body).toContain("USING ERRCODE = '55000'")
  })

  it('accepts only gta-v1 and gtb-v1 without mutating scientific or provenance columns', () => {
    const body = functionSql()
    expect(body).toContain("input_row.labeler_version = 'gta-v1'")
    expect(body).toContain("input_row.labeler_version = 'gtb-v1'")
    expect(body).not.toContain("input_row.labeler_version = 'gta-v2'")

    const updateBlock = body.match(/UPDATE public\.theme_labels[\s\S]*?GET DIAGNOSTICS/)?.[0] ?? ''
    for (const protectedColumn of [
      'scientific_use_status',
      'scientific_use_reason',
      'forecast_origin_manifest_id',
      'forecast_interest_run_id',
      'label_source_run_id',
      'source_cutoff',
      'source_max_date',
    ]) {
      expect(updateBlock).not.toContain(protectedColumn)
    }
  })

  it('exposes the security-definer function only to service_role', () => {
    expect(normalizedSql).toContain('SECURITY DEFINER')
    expect(normalizedSql).toContain('SET search_path = pg_catalog')
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.finalize_tli_legacy_labels(JSONB) FROM PUBLIC, anon, authenticated',
    )
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.finalize_tli_legacy_labels(JSONB) TO service_role',
    )
  })

  it('rejects outcome columns on censored or excluded GT-A rows', () => {
    const body = functionSql()
    expect(body).toContain("input_row.label_status <> 'final'")
    expect(body).toContain('input_row.g_log_ratio IS NOT NULL OR input_row.y_binary IS NOT NULL')
  })

  it('rehearses 269 GT-A and 723 GT-B rows in 500 and 492 row batches', () => {
    expect(rehearsal).toContain('migration-054-legacy-label-finalizer.sql')
    expect(fixture).toContain('generate_series(1, 992)')
    expect(fixture).toContain('ARRAY[0, 500]')
    expect(fixture).toContain("'batches', jsonb_build_array(500, 492)")
    expect(fixture).toContain("'zero_row_sqlstate', '55000'")
    expect(fixture).toContain("'partial_batch_atomic', 'pass'")
    expect(fixture).toContain("'gta_v2_sqlstate', '22023'")
    expect(fixture).toContain("'scientific_contract', 'unchanged'")
  })
})
