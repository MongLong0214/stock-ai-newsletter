import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
)
const snapshotMigrationPath = join(
  process.cwd(),
  'supabase/migrations/046_tli_immutable_source_snapshots.sql',
)
const triggerBindingFixMigrationPath = join(
  process.cwd(),
  'supabase/migrations/051_tli_fix_observation_trigger_binding.sql',
)
const storePath = join(process.cwd(), 'scripts/tli/collectors/collection-run-store.ts')

let sql = ''
let normalizedSql = ''
let snapshotSql = ''
let storeSource = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
  snapshotSql = readFileSync(snapshotMigrationPath, 'utf8').replace(/\s+/g, ' ').trim()
  storeSource = readFileSync(storePath, 'utf8').replace(/\s+/g, ' ').trim()
})

const functionSql = (name: string): string => {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))
  expect(match, `missing CREATE OR REPLACE FUNCTION public.${name}`).not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

const functionSqlFrom = (source: string, name: string): string => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))
  expect(match, `missing CREATE OR REPLACE FUNCTION public.${name}`).not.toBeNull()
  return match?.[0].replace(/\s+/g, ' ').trim() ?? ''
}

describe('migration 050 append_tli_collection_run contract', () => {
  it('matches the exact two-parameter TypeScript caller signature and service-role convention', () => {
    // Given: the production store calls one RPC with two named parameters.
    expect(storeSource).toContain("APPEND_COLLECTION_RUN_RPC = 'append_tli_collection_run'")
    expect(storeSource).toContain('p_run_canonical_json: request.canonicalJson')
    expect(storeSource).toContain('p_payload_sha256: request.payloadSha256')

    // When: migration 050 defines the database boundary.
    const appendSql = functionSql('append_tli_collection_run')

    // Then: SQL and caller names/types are identical and only service_role can execute it.
    expect(appendSql).toContain(
      'public.append_tli_collection_run( p_run_canonical_json TEXT, p_payload_sha256 TEXT ) RETURNS UUID',
    )
    expect(appendSql).toContain(
      'LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, extensions',
    )
    const signature = 'public.append_tli_collection_run(TEXT, TEXT)'
    expect(normalizedSql).toContain(`ALTER FUNCTION ${signature} OWNER TO postgres`)
    expect(normalizedSql).toContain(
      `REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`,
    )
    expect(normalizedSql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`)
  })

  it('removes the service-role direct-insert bypass so the definer RPC is the only append path', () => {
    expect(normalizedSql).toContain(
      'REVOKE INSERT ON TABLE public.tli_collection_runs, public.tli_interest_observations, public.tli_news_observations, public.tli_babl_phase_observations FROM service_role',
    )
  })

  it('strictly parses the canonical run plus observations envelope and verifies nested payload hashes', () => {
    // Given: transport input is untrusted even though the caller canonicalizes it.
    const appendSql = functionSql('append_tli_collection_run')

    // When: the RPC parses the envelope.
    // Then: the existing canonical parser, exact root keys, and raw nested JSON hashes are enforced.
    expect(appendSql).toContain(
      'public.tli_require_canonical_json_v1( p_run_canonical_json, p_payload_sha256 )',
    )
    expect(appendSql).toContain("v_root_allowed_keys CONSTANT TEXT[] := ARRAY['run', 'observations']")
    expect(appendSql).toContain("jsonb_typeof(v_payload -> 'run') IS DISTINCT FROM 'object'")
    expect(appendSql).toContain("jsonb_typeof(v_payload -> 'observations') IS DISTINCT FROM 'array'")
    expect(appendSql).toContain(
      "public.tli_sha256_text(public.tli_render_canonical_json_v1(v_run -> 'request_payload'))",
    )
    expect(appendSql).toContain(
      "public.tli_sha256_text(public.tli_render_canonical_json_v1(v_run -> 'response_payload'))",
    )
    expect(appendSql).toContain("USING ERRCODE = '22023'")
  })

  it('bounds resource use and rejects non-canonical timestamps or out-of-range typed values early', () => {
    const appendSql = functionSql('append_tli_collection_run')

    expect(appendSql).toContain('octet_length(p_run_canonical_json) > 16777216')
    expect(appendSql).toContain('jsonb_array_length(v_observations) > 10000')
    expect(appendSql).toContain("USING ERRCODE = '54000'")
    expect(appendSql).toContain(
      `v_run ->> 'requested_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$'`,
    )
    expect(appendSql).toContain(
      `to_char(v_requested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    )
    expect(appendSql).toContain("PERFORM (v_observation ->> 'raw_value')::INTEGER")
    expect(appendSql).toContain("PERFORM (v_observation ->> 'article_count')::INTEGER")
    expect(appendSql).toContain("PERFORM (v_observation ->> 'evaluation_horizon_days')::INTEGER")
  })

  it('routes each source to its exact observation table and injects one generated run id', () => {
    // Given: the payload may contain one of the three fixed source shapes.
    const appendSql = functionSql('append_tli_collection_run')

    // When: the RPC dispatches on run.source.
    expect(appendSql).toContain('CASE v_source')

    // Then: every route writes only its matching table with the generated parent id.
    for (const source of ['naver_datalab', 'naver_news', 'babl_phase']) {
      expect(appendSql).toContain(`WHEN '${source}' THEN`)
    }
    expect(appendSql).toContain('INSERT INTO public.tli_collection_runs')
    expect(appendSql).toContain('INSERT INTO public.tli_interest_observations')
    expect(appendSql).toContain('INSERT INTO public.tli_news_observations')
    expect(appendSql).toContain('INSERT INTO public.tli_babl_phase_observations')
    expect(appendSql).toContain('v_run_id UUID := extensions.gen_random_uuid()')
    expect(appendSql).toContain('RETURN v_run_id')
  })

  it('allows complete only for exact observed count and key hash while validating every status count', () => {
    // Given: run-declared counts and expected key hashes can be tampered independently of observations.
    const appendSql = functionSql('append_tli_collection_run')

    // When: the RPC validates the batch before the deferred triggers re-check inserted rows.
    // Then: observed count always matches, and complete requires 100 percent count and key coverage.
    expect(appendSql).toContain("v_observed_row_count IS DISTINCT FROM jsonb_array_length(v_observations)")
    expect(appendSql).toContain('v_expected_row_count < v_observed_row_count')
    expect(appendSql).toContain("IF v_status = 'complete' THEN")
    expect(appendSql).toContain('v_expected_row_count IS DISTINCT FROM v_observed_row_count')
    expect(appendSql).toContain(
      'v_expected_keys_sha256 IS DISTINCT FROM public.tli_sha256_json_string_array(v_observation_keys)',
    )
    expect(appendSql).toContain('complete collection run does not contain the exact expected key set')
    expect(appendSql).toContain("USING ERRCODE = '55000'")
  })

  it('derives source maxima and verifies exact B-Abl source-pool and payload-hash provenance', () => {
    const appendSql = functionSql('append_tli_collection_run')

    expect(appendSql).toContain('v_source_max_date IS DISTINCT FROM v_actual_source_max_date')
    expect(appendSql).toContain(
      "v_observation ->> 'source_prediction_snapshot_id' IS DISTINCT FROM v_source_prediction_snapshot_id::TEXT",
    )
    expect(appendSql).toContain(
      'source_snapshot.candidate_pool IS DISTINCT FROM observation.candidate_pool',
    )
    expect(appendSql).toContain(
      'source_comparison_run.candidate_pool IS DISTINCT FROM observation.candidate_pool',
    )
    expect(appendSql).toContain(
      "v_observation ->> 'payload_hash' IS DISTINCT FROM v_expected_babl_payload_hash",
    )
    expect(appendSql).toContain(
      'public.tli_render_canonical_json_v1( jsonb_build_object(',
    )
    expect(appendSql).toContain(
      "v_source = 'babl_phase' AND v_status = 'complete' AND v_observed_row_count = 0",
    )
  })

  it('keeps run and observations in one statement transaction so any child failure rolls everything back', () => {
    // Given: the parent insert precedes the routed child batch.
    const appendSql = functionSql('append_tli_collection_run')
    const runInsert = appendSql.indexOf('INSERT INTO public.tli_collection_runs')
    const firstChildInsert = appendSql.indexOf('INSERT INTO public.tli_interest_observations')

    // When: a child cast, FK, CHECK, or UNIQUE constraint fails.
    // Then: no conflict-swallowing or autonomous transaction path can preserve the parent.
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect(runInsert).toBeGreaterThan(-1)
    expect(firstChildInsert).toBeGreaterThan(runInsert)
    expect(appendSql).not.toContain('ON CONFLICT')
    expect(appendSql).not.toContain('COMMIT')
    expect(appendSql).not.toContain('ROLLBACK')
  })

  it('preserves the existing source UNIQUE constraints and deferred append-only validation', () => {
    // Given: migration 046 remains immutable and supplies the terminal guards.
    const uniqueContracts = [
      'UNIQUE (collection_run_id, theme_id, trading_date, source)',
      'UNIQUE (collection_run_id, theme_id, article_date)',
      'UNIQUE (collection_run_id, theme_id, snapshot_date, algorithm_version, candidate_pool, comparison_spec_version, evaluation_horizon_days)',
    ]

    // When: migration 050 adds only the missing append path.
    // Then: duplicate batches still raise native 23505 and deferred validation remains active.
    for (const contract of uniqueContracts) expect(snapshotSql).toContain(contract)
    expect(snapshotSql).toContain('CREATE CONSTRAINT TRIGGER validate_tli_collection_run_after_insert')
    expect(snapshotSql).toContain('DEFERRABLE INITIALLY DEFERRED')
    expect(snapshotSql).toContain('complete collection run does not contain the exact expected key set')
  })
})

describe('migration 051 observation trigger record binding contract', () => {
  it('replaces only the unsafe cross-table NEW-field CASE with statement-level branches', () => {
    // Given: 046 is already applied and its trigger function must otherwise remain byte-for-byte equivalent.
    expect(existsSync(triggerBindingFixMigrationPath), 'migration 051 must exist').toBe(true)
    const fixSql = readFileSync(triggerBindingFixMigrationPath, 'utf8')
    const originalFunction = functionSqlFrom(
      readFileSync(snapshotMigrationPath, 'utf8'),
      'validate_tli_collection_run_observations',
    )
    const fixedFunction = functionSqlFrom(fixSql, 'validate_tli_collection_run_observations')
    const unsafeBinding = [
      'v_run_id := CASE',
      "WHEN TG_TABLE_NAME = 'tli_collection_runs' THEN NEW.id",
      'ELSE NEW.collection_run_id',
      'END;',
    ].join(' ')
    const safeBinding = [
      "IF TG_TABLE_NAME = 'tli_collection_runs' THEN",
      'v_run_id := NEW.id;',
      "ELSIF TG_TABLE_NAME IN ('tli_interest_observations', 'tli_news_observations', 'tli_babl_phase_observations') THEN",
      'v_run_id := NEW.collection_run_id;',
      'END IF;',
    ].join(' ')

    // When: migration 051 replaces the function.
    // Then: only the binding statement changes, preserving signature, security, search_path, and all validation logic.
    expect(fixedFunction).toBe(originalFunction.replace(unsafeBinding, safeBinding))
  })

  it('ships as one transactional function replacement without recreating applied triggers', () => {
    expect(existsSync(triggerBindingFixMigrationPath), 'migration 051 must exist').toBe(true)
    const normalizedFixSql = readFileSync(triggerBindingFixMigrationPath, 'utf8').replace(/\s+/g, ' ').trim()

    expect(normalizedFixSql).toMatch(/^BEGIN;/)
    expect(normalizedFixSql).toMatch(/COMMIT;$/)
    expect(normalizedFixSql).not.toContain('v_run_id := CASE')
    expect(normalizedFixSql).not.toContain('CREATE CONSTRAINT TRIGGER')
  })
})
