import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/055_tli_label_truncate_guard_and_cohort_view.sql',
)
const rehearsalPath = join(process.cwd(), 'scripts/tli/e2e/rehearse-migration-055.sh')
const probePath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/migration-055-label-truncate-and-latest-cohort.sql',
)

let sql = ''
let normalizedSql = ''
let rehearsal = ''
let probeSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  rehearsal = readFileSync(rehearsalPath, 'utf8')
  probeSql = readFileSync(probePath, 'utf8').replace(/\s+/g, ' ').trim()
})

const functionSql = (name: string): string => {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))
  expect(match, `missing CREATE OR REPLACE FUNCTION public.${name}`).not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

describe('migration 055 label truncate guard and atomic latest cohort', () => {
  it('is additive, transaction-wrapped, and rehearsed after migrations 049 through 054', () => {
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
      '055_tli_label_truncate_guard_and_cohort_view.sql',
    ]) {
      const offset = rehearsal.indexOf(migration)
      expect(offset).toBeGreaterThan(previousOffset)
      previousOffset = offset
    }
  })

  it('denies direct and cascaded label truncation through ACL and a statement trigger', () => {
    const truncateGuard = functionSql('reject_tli_theme_labels_truncate')

    expect(truncateGuard).toContain("USING ERRCODE = '42501'")
    expect(truncateGuard).toContain('current_user IS DISTINCT FROM pg_get_userbyid')
    expect(truncateGuard).toContain(
      "'public.reject_tli_theme_labels_truncate()'::REGPROCEDURE",
    )
    expect(truncateGuard).toContain(
      "current_setting('tli.theme_labels_truncate_xid', true)",
    )
    expect(truncateGuard).toContain('pg_current_xact_id()::text')
    expect(normalizedSql).toContain(
      'BEFORE TRUNCATE ON public.theme_labels FOR EACH STATEMENT',
    )
    expect(normalizedSql).toContain(
      'REVOKE TRUNCATE ON TABLE public.theme_labels FROM service_role',
    )
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.reject_tli_theme_labels_truncate() FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(probeSql).toContain("'service_truncate_sqlstate', '42501'")
    expect(probeSql).toContain("'service_truncate_cascade_sqlstate', '42501'")
    expect(probeSql).toContain("'service_correct_guc_sqlstate', '42501'")
    expect(probeSql).toContain("'owner_truncate_sqlstate', '42501'")
    expect(probeSql).toContain("'owner_truncate_cascade_sqlstate', '42501'")
    expect(probeSql).toContain("'owner_dual_guard_path', 'pass_rolled_back'")
    expect(probeSql).toContain("'label_rows_preserved', 'pass'")
    expect(probeSql).toContain("'truncate_guard_catalog', 'pass'")
    expect(probeSql).toContain("'rpc_acl_catalog', 'pass'")
  })

  it('keeps the existing gta-v2 owner-plus-GUC guard and both finalizers byte-stable', () => {
    for (const protectedFunction of [
      'guard_tli_gta_v2_label_transition',
      'finalize_tli_gta_v2_label',
      'finalize_tli_legacy_labels',
    ]) {
      expect(normalizedSql).not.toContain(
        `CREATE OR REPLACE FUNCTION public.${protectedFunction}`,
      )
    }
    expect(probeSql).toContain("'protected_function_contracts', 'unchanged'")
    expect(probeSql).toContain("'gta_v2_owner_and_guc_guard', 'unchanged'")
  })

  it('returns the scoped latest public cohort from one materialized statement snapshot', () => {
    const latestCohort = functionSql('load_tli_latest_public_scientific_predictions_v3')

    expect(latestCohort).toContain('LANGUAGE sql')
    expect(latestCohort).toContain('STABLE')
    expect(latestCohort).toContain('SECURITY INVOKER')
    expect(latestCohort).toContain('WITH scoped_predictions AS MATERIALIZED')
    expect(latestCohort).toContain('FROM public.tli_public_scientific_predictions_v3')
    expect(latestCohort).toContain('p_theme_id IS NULL OR prediction.theme_id = p_theme_id')
    expect(latestCohort).toContain('SELECT max(candidate.prediction_date)')
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID) TO service_role',
    )
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.load_tli_latest_public_scientific_predictions_v3(UUID) FROM PUBLIC, anon, authenticated',
    )
  })

  it('adds the exact general scientific-label lookup index without replacing hot indexes', () => {
    expect(normalizedSql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_theme_labels_forecast_origin_base_date_id ON public.theme_labels (forecast_origin_manifest_id, base_date, id)',
    )
    expect(normalizedSql).not.toContain('DROP INDEX')
    expect(probeSql).toContain('idx_theme_labels_forecast_origin_base_date_id')
    expect(probeSql).toContain("'general_label_index', 'present'")
    expect(probeSql).toContain(
      "RAISE EXCEPTION 'migration 055 general label index is not selected by the target query'",
    )
  })

  it('reproduces the two-statement release swap race and proves atomic old-or-new cohorts', () => {
    expect(rehearsal).toContain('postgres:17')
    expect(rehearsal).toContain('migration-055-label-truncate-and-latest-cohort.sql')
    expect(rehearsal).toContain("'two_statement_race', 'reproduced'")
    expect(rehearsal).toContain("'atomic_during_swap', 'old_cohort'")
    expect(rehearsal).toContain("'atomic_after_swap', 'new_cohort'")
    expect(probeSql).toContain("'global_latest_cohort', 'pass'")
    expect(probeSql).toContain("'theme_scoped_latest_cohort', 'pass'")
  })
})
