import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/053_tli_label_guard_and_legacy_prediction_upsert.sql',
)
const rehearsalPath = join(
  process.cwd(),
  'scripts/tli/e2e/rehearse-migration-053.sh',
)
const probePath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/migration-053-security-and-legacy-upsert.sql',
)
const lifecycleProbePath = join(
  process.cwd(),
  'scripts/tli/e2e/sql/todo12-lifecycle-rehearsal.sql',
)

let sql = ''
let normalizedSql = ''
let rehearsal = ''
let rawProbeSql = ''
let probeSql = ''
let lifecycleProbeSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  rehearsal = readFileSync(rehearsalPath, 'utf8')
  rawProbeSql = readFileSync(probePath, 'utf8')
  probeSql = rawProbeSql.replace(/\s+/g, ' ').trim()
  lifecycleProbeSql = readFileSync(lifecycleProbePath, 'utf8')
})

const functionSql = (name: string): string => {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))
  expect(match, `missing CREATE OR REPLACE FUNCTION public.${name}`).not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

describe('migration 053 F2 database remediation', () => {
  it('is append-only, transaction-wrapped, and rehearsed after migrations 049 through 052', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)

    const migrationNames = [
      '049_tli_experiment_cycles.sql',
      '050_tli_collection_append_rpc_and_git_sha.sql',
      '051_tli_fix_observation_trigger_binding.sql',
      '052_tli_abstain_sentinel_db_guard.sql',
      '053_tli_label_guard_and_legacy_prediction_upsert.sql',
    ]
    let previousOffset = -1
    for (const migrationName of migrationNames) {
      const offset = rehearsal.indexOf(migrationName)
      expect(offset).toBeGreaterThan(previousOffset)
      previousOffset = offset
    }
  })

  it('accepts only pristine pending gta-v2 rows on direct insert', () => {
    const insertGuard = functionSql('enforce_tli_gta_v2_label_provenance')

    expect(insertGuard).toContain("NEW.label_status IS DISTINCT FROM 'pending'")
    expect(insertGuard).toContain("NEW.scientific_use_status IS DISTINCT FROM 'exploratory_only'")
    expect(insertGuard).toContain("NEW.scientific_use_reason IS DISTINCT FROM 'pending_gta_v2'")
    expect(insertGuard).toContain('NEW.rescale_suspect IS DISTINCT FROM FALSE')
    for (const field of [
      'g_log_ratio',
      'y_binary',
      'denominator',
      'exclude_reason',
      'finalized_at',
      'forecast_interest_run_id',
      'label_source_run_id',
      'source_cutoff',
      'source_max_date',
      'label_request_sha256',
      'label_response_sha256',
      'past_dates',
      'future_dates',
      'past_observation_count',
      'future_observation_count',
      'forecast_keyword_group_sha256',
      'basket_excess_return',
      'basket_size',
    ]) {
      expect(insertGuard).toContain(`NEW.${field} IS NOT NULL`)
    }
    expect(insertGuard).toContain('NEW.low_signal IS DISTINCT FROM FALSE')
    expect(insertGuard).toContain('NEW.keyword_epoch IS DISTINCT FROM 1')
    expect(insertGuard).toContain("USING ERRCODE = '42501'")
  })

  it('requires both the finalizer function owner and the row-scoped GUC for updates', () => {
    const transitionGuard = functionSql('guard_tli_gta_v2_label_transition')

    expect(transitionGuard).toContain('current_user IS DISTINCT FROM pg_get_userbyid((')
    expect(transitionGuard).toContain(
      "'public.finalize_tli_gta_v2_label(text,text)'::REGPROCEDURE",
    )
    expect(transitionGuard).toContain(
      "current_setting('tli.finalize_gta_v2_label_id', true) IS DISTINCT FROM OLD.id::text",
    )
    expect(transitionGuard).toContain("USING ERRCODE = '42501'")
  })

  it('narrows direct label updates to legacy columns while protecting gta-v2 provenance', () => {
    expect(normalizedSql).toContain(
      'REVOKE UPDATE ON TABLE public.theme_labels FROM service_role',
    )
    const legacyGrant = sql.match(
      /GRANT UPDATE\s*\(([\s\S]*?)\)\s*ON TABLE public\.theme_labels\s*TO service_role;/,
    )?.[1] ?? ''
    for (const field of [
      'theme_id',
      'base_date',
      'label_type',
      'horizon_days',
      'g_log_ratio',
      'y_binary',
      'denominator',
      'label_status',
      'exclude_reason',
      'labeler_version',
      'finalized_at',
    ]) {
      expect(legacyGrant).toContain(field)
    }
    for (const protectedField of [
      'scientific_use_status',
      'scientific_use_reason',
      'forecast_origin_manifest_id',
      'label_source_run_id',
      'label_request_sha256',
      'label_response_sha256',
    ]) {
      expect(legacyGrant).not.toContain(protectedField)
    }
    expect(probeSql).toContain("'protected_column_update_sqlstate', '42501'")
    expect(probeSql).toContain("'legacy_column_update', 'pass'")
  })

  it('rehearses forged terminal inserts, a spoofed GUC, and the real finalizer', () => {
    const spoofedUpdate = rawProbeSql.match(
      /DO \$spoofed_guc_update\$[\s\S]*?\$spoofed_guc_update\$;/,
    )?.[0] ?? ''

    expect(rehearsal).toContain('migration-053-security-and-legacy-upsert.sql')
    expect(probeSql).toContain("'direct_final_insert_sqlstate', '42501'")
    expect(probeSql).toContain("'direct_excluded_insert_sqlstate', '42501'")
    expect(probeSql).toContain("'preloaded_pending_insert_sqlstate', '42501'")
    expect(probeSql).toContain("'spoofed_guc_update_sqlstate', '42501'")
    expect(spoofedUpdate).toContain("SET label_status = 'excluded'")
    expect(spoofedUpdate).not.toContain('scientific_use_')
    expect(probeSql).toContain('SET ROLE service_role')
    expect(probeSql).toContain('public.finalize_tli_gta_v2_label(')
    expect(probeSql).toContain("'finalizer_status', label_status")
    expect(probeSql).toContain("'finalizer_reason', scientific_use_reason")
    expect(probeSql).toContain("AND label_status = 'excluded'")
    expect(probeSql).toContain("AND scientific_use_reason = 'spec_mismatch'")
  })

  it('keeps revoked canonical helpers outside service-role execution and fails on a missing final row', () => {
    const serviceRoleStart = rawProbeSql.indexOf('SET ROLE service_role;')
    const serviceRoleEnd = rawProbeSql.indexOf('RESET ROLE;', serviceRoleStart)
    expect(serviceRoleStart).toBeGreaterThan(-1)
    expect(serviceRoleEnd).toBeGreaterThan(serviceRoleStart)

    const serviceRoleBlock = rawProbeSql.slice(serviceRoleStart, serviceRoleEnd)
    expect(serviceRoleBlock).not.toContain('public.tli_render_canonical_json_v1')
    expect(serviceRoleBlock).not.toContain('public.tli_sha256_text')
    expect(probeSql).toContain('DO $final_assertions$')
    expect(probeSql).toContain("RAISE EXCEPTION 'migration 053 final state assertion failed'")
  })

  it('upserts only cycle-null pending predictions through the partial legacy index', () => {
    const legacyUpsert = functionSql('upsert_tli_legacy_predictions_v3')

    expect(legacyUpsert).toContain('SECURITY DEFINER')
    expect(legacyUpsert).toContain('jsonb_to_recordset(p_rows)')
    expect(legacyUpsert).toContain(
      'ON CONFLICT (theme_id, prediction_date, horizon_days, model_version) WHERE experiment_cycle_id IS NULL',
    )
    expect(legacyUpsert).toContain("prediction.score_status = 'pending'")
    expect(legacyUpsert).toContain('v_affected_count IS DISTINCT FROM v_requested_count')
    expect(normalizedSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.upsert_tli_legacy_predictions_v3(JSONB) TO service_role',
    )
    expect(probeSql).toContain("'old_upsert_sqlstate', '42P10'")
    expect(probeSql).toContain('public.upsert_tli_legacy_predictions_v3(')
    expect(probeSql).toContain("'legacy_rpc_upsert', 'pass'")
  })

  it('rehearses the production writer through an authenticated PostgREST RPC', () => {
    expect(rehearsal).toContain('postgrest/postgrest:v14.12')
    expect(rehearsal).toContain('PGRST_DB_URI')
    expect(rehearsal).toContain('PGRST_JWT_SECRET')
    expect(rehearsal).toContain('GRANT service_role TO authenticator')
    expect(rehearsal).toContain("role: 'service_role'")
    expect(rehearsal).toMatch(
      /import\(\s*'\.\/scripts\/tli\/comparison\/legacy-prediction-writer\.ts'\s*\)/,
    )
    expect(rehearsal).toContain('upsertLegacyPredictionsV3([row])')
    expect(rehearsal).toContain("url.pathname.replace(/^\\/rest\\/v1/, '')")
    expect(rehearsal).toContain("'postgrest_production_writer', 'pass'")
  })

  it('keeps the Todo12 abstain-label scoring reason identical to the finalizer result', () => {
    const scorePrediction = lifecycleProbeSql.match(
      /CREATE OR REPLACE FUNCTION pg_temp\.score_prediction\([\s\S]*?\n\$score_prediction\$;/,
    )?.[0]

    expect(scorePrediction).toBeDefined()
    expect(scorePrediction).toContain("'score_exclusion_reason', 'spec_mismatch'")
    expect(scorePrediction).not.toContain("'score_exclusion_reason', 'source_gap_sla'")
  })
})
