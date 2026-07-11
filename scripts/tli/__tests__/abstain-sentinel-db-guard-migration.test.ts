import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/052_tli_abstain_sentinel_db_guard.sql',
)
const priorMigrationPath = join(
  process.cwd(),
  'supabase/migrations/049_tli_experiment_cycles.sql',
)
const rehearsalPath = join(
  process.cwd(),
  'scripts/tli/e2e/rehearse-migration-052.sh',
)
const fixturePath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/migration-052-malformed-abstain-fixture.sql',
)
const rejectionPath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/migration-052-abstain-sentinel-rejection.sql',
)

let sql = ''
let priorSql = ''
let normalizedSql = ''
let rehearsal = ''
let fixtureSql = ''
let rejectionSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  priorSql = readFileSync(priorMigrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  rehearsal = readFileSync(rehearsalPath, 'utf8')
  fixtureSql = readFileSync(fixturePath, 'utf8').replace(/\s+/g, ' ').trim()
  rejectionSql = readFileSync(rejectionPath, 'utf8').replace(/\s+/g, ' ').trim()
})

const functionSqlFrom = (source: string, name: string): string => {
  const match = source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))
  expect(match, `missing CREATE OR REPLACE FUNCTION public.${name}`).not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

const functionSql = (name: string): string => functionSqlFrom(sql, name)

describe('migration 052 scientific abstain sentinel DB guard', () => {
  it('is transaction-wrapped and rehearses migrations 049 through 052 in order', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect(rehearsal).toContain('049_tli_experiment_cycles.sql')
    expect(rehearsal).toContain('050_tli_collection_append_rpc_and_git_sha.sql')
    expect(rehearsal).toContain('051_tli_fix_observation_trigger_binding.sql')
    expect(rehearsal).toContain('052_tli_abstain_sentinel_db_guard.sql')
  })

  it('defines one exact sentinel validator with SQLSTATE 23514', () => {
    const validator = functionSql('tli_assert_scientific_prediction_sentinel')

    expect(validator).toContain('p_abstain IS TRUE')
    expect(validator).toContain(
      'p_p_rise IS NOT NULL OR p_ci_lower IS NOT NULL OR p_ci_upper IS NOT NULL',
    )
    expect(validator).toContain('p_abstain IS FALSE')
    expect(validator).toContain(
      'p_p_rise IS NULL OR p_ci_lower IS NULL OR p_ci_upper IS NULL',
    )
    expect(validator).toContain(
      '0 <= p_ci_lower AND p_ci_lower <= p_p_rise AND p_p_rise <= p_ci_upper AND p_ci_upper <= 1',
    )
    expect(validator).toContain("USING ERRCODE = '23514'")
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.tli_assert_scientific_prediction_sentinel(BOOLEAN, NUMERIC, NUMERIC, NUMERIC) TO service_role',
    )
    expect(rejectionSql).toContain("('non-abstain-nan', FALSE, 'NaN'::NUMERIC, 0, 1)")
    expect(rejectionSql).toContain("('non-abstain-positive-infinity', FALSE, 'Infinity'::NUMERIC, 0, 1)")
    expect(rejectionSql).toContain("('non-abstain-negative-infinity', FALSE, '-Infinity'::NUMERIC, 0, 1)")
    expect(rejectionSql).toContain("'validator_rejection_case_count', 15")
  })

  it('guards scientific inserts while preserving cycle-null legacy inserts', () => {
    const insertGuard = functionSql('validate_tli_scientific_prediction_sentinel_insert')

    expect(insertGuard).toContain('IF NEW.experiment_cycle_id IS NULL THEN RETURN NEW')
    expect(insertGuard).toContain(
      'PERFORM public.tli_assert_scientific_prediction_sentinel( NEW.abstain, NEW.p_rise, NEW.ci_lower, NEW.ci_upper )',
    )
    expect(normalizedSql).toContain(
      'CREATE TRIGGER check_tli_scientific_prediction_sentinel_insert BEFORE INSERT ON public.theme_predictions_v3 FOR EACH ROW EXECUTE FUNCTION public.validate_tli_scientific_prediction_sentinel_insert()',
    )
    expect('check_tli_scientific_prediction_sentinel_insert'
      < 'validate_tli_scientific_prediction_insert').toBe(true)
    expect(rejectionSql).toContain("ARRAY['legacy-cycle-null-remains-unchanged']")
    expect(rejectionSql).toContain("'legacy_cycle_null_insert', 'pass'")
  })

  it('rechecks the persisted row inside the finalization RPC before foundation reads or mutation', () => {
    const finalizer = functionSql('finalize_tli_scientific_prediction_score')
    const priorFinalizer = functionSqlFrom(
      priorSql,
      'finalize_tli_scientific_prediction_score',
    )
    const sentinelAssertion = [
      'PERFORM public.tli_assert_scientific_prediction_sentinel(',
      'v_prediction.abstain,',
      'v_prediction.p_rise,',
      'v_prediction.ci_lower,',
      'v_prediction.ci_upper',
      ');',
    ].join(' ')
    const rowLock = finalizer.indexOf('FOR UPDATE')
    const sentinelCheck = finalizer.indexOf(
      'PERFORM public.tli_assert_scientific_prediction_sentinel(',
    )
    const originRead = finalizer.indexOf('SELECT * INTO v_origin')
    const mutation = finalizer.indexOf('UPDATE public.theme_predictions_v3')

    expect(rowLock).toBeGreaterThan(0)
    expect(sentinelCheck).toBeGreaterThan(rowLock)
    expect(sentinelCheck).toBeLessThan(originRead)
    expect(sentinelCheck).toBeLessThan(mutation)
    expect(finalizer.replace(` ${sentinelAssertion}`, '')).toBe(priorFinalizer)
    expect(finalizer).toContain('SECURITY DEFINER')
    expect(finalizer).toContain('SET search_path = public, extensions')
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT) FROM PUBLIC, anon, authenticated',
    )
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.finalize_tli_scientific_prediction_score(TEXT, TEXT) TO service_role',
    )
    expect(normalizedSql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.validate_tli_scientific_prediction_sentinel_insert() FROM PUBLIC, anon, authenticated, service_role',
    )
  })

  it('rehearses both direct insert and service-role RPC rejection at SQL level', () => {
    const fixtureOffset = rehearsal.indexOf('migration-052-malformed-abstain-fixture.sql')
    const migrationOffset = rehearsal.indexOf('052_tli_abstain_sentinel_db_guard.sql')
    const rejectionOffset = rehearsal.indexOf('migration-052-abstain-sentinel-rejection.sql')

    expect(fixtureOffset).toBeGreaterThan(0)
    expect(fixtureOffset).toBeLessThan(migrationOffset)
    expect(migrationOffset).toBeLessThan(rejectionOffset)
    expect(fixtureSql).toContain('SET LOCAL session_replication_role = replica')
    expect(fixtureSql).toContain("TRUE, ARRAY['r5-service-role-bypass']")
    expect(rejectionSql).toContain("WHEN SQLSTATE '23514' THEN")
    expect(rejectionSql).toContain('SET ROLE service_role')
    expect(rejectionSql).toContain('public.finalize_tli_scientific_prediction_score(')
    expect(rejectionSql).toContain("'insert_sqlstate', '23514'")
    expect(rejectionSql).toContain("'finalize_sqlstate', '23514'")
  })
})
