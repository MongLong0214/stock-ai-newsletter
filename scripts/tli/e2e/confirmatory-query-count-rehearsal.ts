/**
 * F1 audit remediation (D2): proves that the confirmatory feature batch loader
 * (`loadConfirmatoryFeatureBatch` + `createSupabaseConfirmatoryFeatureBatchDataSource`) issues a
 * DB-query count that is independent of theme count — a batched O(1) loader, not per-theme N+1.
 *
 * This is a *real* scratch-Postgres measurement, not a mock:
 *  - a throwaway `postgres:17` container is booted with `log_statement = 'all'`,
 *  - the exact prod schema dump + migrations 049–051 are applied,
 *  - a study-origin manifest is seeded with N usable themes via `generate_series`,
 *  - the loader runs through a `SupabaseConfirmatoryClient` shim that executes every terminal query
 *    as one real SQL statement via `psql` and increments a counter (the "instrumentation wrapper"),
 *  - the wrapper count is cross-checked against Postgres's own `log_statement=all` server log.
 *
 * Assertions: the number of data-source method invocations is exactly 8 for both a 5-theme and a
 * 193-theme fixture (the loader's O(1) logical-read structure), and with a batch width ≥ the data
 * the real SQL statement count is identical for 5 and 193 themes (literal O(1)); with the default
 * page/chunk sizes the statement count grows only via bounded pagination/chunking, never per theme.
 *
 * Run: `npx tsx scripts/tli/e2e/confirmatory-query-count-rehearsal.ts <prod-schema.sql> [outfile]`
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

import {
  loadConfirmatoryFeatureBatch,
  type ConfirmatoryFeatureBatchDataSource,
} from '@/scripts/tli/features/load-confirmatory-feature-inputs'
import {
  createSupabaseConfirmatoryFeatureBatchDataSource,
} from '@/scripts/tli/features/supabase-confirmatory-feature-source'
import type {
  SupabaseConfirmatoryClient,
  SupabaseConfirmatoryQuery,
  SupabaseConfirmatoryQueryResult,
} from '@/scripts/tli/features/supabase-confirmatory-query'

const CONTAINER = 'tli-f1-d2-querycount'
const IMAGE = 'postgres:17'
const READY_SENTINEL = 'PostgreSQL init process complete; ready for start up.'
const MIGRATIONS = [
  'supabase/migrations/049_tli_experiment_cycles.sql',
  'supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql',
  'supabase/migrations/051_tli_fix_observation_trigger_binding.sql',
] as const

const SHIMS = `DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE PUBLICATION supabase_realtime;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
RETURNS UUID LANGUAGE sql VOLATILE PARALLEL SAFE
AS 'SELECT pg_catalog.gen_random_uuid()';
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB LANGUAGE sql STABLE AS 'SELECT NULL::JSONB';
`

const HEX64 = 'a'.repeat(64)

type Runner = (command: string, args: readonly string[], input?: string) => {
  status: number | null
  stdout: string
  stderr: string
}

const run: Runner = (command, args, input) => {
  const result = spawnSync(command, [...args], { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const psqlExec = (sql: string, capture = false): string => {
  const args = ['exec', '-i', CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']
  if (capture) args.splice(args.indexOf('psql') + 1, 0, '-qAt')
  const result = run('docker', args, sql)
  if (result.status !== 0) throw new Error(`psql failed (${result.status}): ${(result.stderr || result.stdout).trim()}`)
  return result.stdout
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const cleanup = (): void => { run('docker', ['rm', '-f', CONTAINER]) }

const startPostgres = (prodSchemaPath: string): string => {
  cleanup()
  if (run('docker', ['info']).status !== 0) throw new Error('docker is not available')
  // log_statement=all makes every SQL statement land in the container log (the ground-truth counter).
  run('docker', [
    'run', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-d', IMAGE,
    '-c', 'log_statement=all', '-c', 'log_min_messages=warning',
  ])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = run('docker', ['logs', CONTAINER])
    const initComplete = logs.status === 0 && `${logs.stdout}\n${logs.stderr}`.includes(READY_SENTINEL)
    const isReady = run('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres']).status === 0
    if (initComplete && isReady) { ready = true; break }
    sleep(250)
  }
  if (!ready) throw new Error('postgres did not become ready')
  psqlExec(SHIMS)
  const schema = readFileSync(prodSchemaPath, 'utf8')
    .replace(/^.*CREATE EXTENSION IF NOT EXISTS "supabase_vault".*(?:\r?\n|$)/gm, '')
  psqlExec(schema)
  for (const migration of MIGRATIONS) psqlExec(readFileSync(migration, 'utf8'))
  return psqlExec('SHOW server_version;', true).trim()
}

const md5Uuid = (value: string): string => {
  const hex = createHash('md5').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

interface Fixture {
  readonly label: string
  readonly themeCount: number
  readonly originDate: string
  readonly firstOriginDate: string
}

/**
 * Seeds one fully namespaced study-origin manifest with `themeCount` usable themes (20 interest days
 * + 14 news observations each, plus a partial DataLab and News run per theme). Append-only tables
 * forbid TRUNCATE/DELETE, so every fixture uses disjoint ids and can coexist in one database.
 * Returns the study-origin manifest id the loader is invoked with.
 */
const seedFixture = (fixture: Fixture): string => {
  const { label, themeCount, originDate, firstOriginDate } = fixture
  const ns = (kind: string) => `md5('f1-d2|${label}|${kind}')::uuid`
  const nsTheme = `md5('f1-d2|${label}|theme|' || g)::uuid`
  const nsInterestRun = `md5('f1-d2|${label}|interest-run|' || g)::uuid`
  const nsNewsRun = `md5('f1-d2|${label}|news-run|' || g)::uuid`
  const studyManifestId = md5Uuid(`f1-d2|${label}|study-origin`)
  const sharedControl = "md5('f1-d2|shared-control')::uuid"
  const sharedContract = "md5('f1-d2|shared-study-contract')::uuid"
  const sql = `
BEGIN;
-- A single shared, disabled control row (a partial unique index forbids two enabled rows).
INSERT INTO comparison_v4_control (id, production_version, serving_enabled)
VALUES (${sharedControl}, 'f1-d2-shared', false)
ON CONFLICT (id) DO NOTHING;

-- A single shared study contract (contract_version is UNIQUE); both fixtures bind to it.
INSERT INTO tli_attention_study_contracts (
  id, contract_version, locked_at, first_origin_date, babl_algorithm_version,
  babl_comparison_spec_version, babl_evaluation_horizon_days, babl_candidate_pool_rule,
  babl_control_row_id, babl_control_sha256, labeler_version, label_contract_sha256,
  feature_contract_version, feature_contract_sha256, payload_sha256, git_commit_sha,
  git_blob_sha, repo_relative_path, verifier_version, verifier_code_sha, verified_at
) VALUES (
  ${sharedContract}, 'tli-attention-study-v1', TIMESTAMPTZ '2026-01-01T00:00:00Z',
  DATE '${firstOriginDate}', 'babl-algo-v1', 'comparison-v4-spec-v1', 14, 'source_prod_run_v1',
  ${sharedControl}, '${HEX64}', 'gta-v2', '${HEX64}', 'tli-attention-v2-f1', '${HEX64}',
  '${HEX64}', '${HEX64}', '${HEX64}',
  'docs/evidence/tli-v3-scientific-rebuild/studies/' || (${sharedContract})::text || '/study-contract.json',
  'tli-local-fixture-verifier-v1', '${HEX64}', TIMESTAMPTZ '2026-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO themes (id, name, keyword_epoch)
SELECT ${nsTheme}, 'theme-${label}-' || g, 1 FROM generate_series(1, ${themeCount}) g;

INSERT INTO tli_forecast_origin_manifests (
  id, manifest_version, origin_date, forecast_cutoff, expected_theme_ids, expected_theme_count,
  expected_universe_sha256, keyword_group_manifest_sha256, payload_sha256
) VALUES (
  ${ns('forecast-origin')}, 'tli-forecast-origin-v1', DATE '${originDate}',
  (DATE '${originDate}' + TIME '18:00') AT TIME ZONE 'Asia/Seoul',
  (SELECT jsonb_agg(to_jsonb((${nsTheme})::text)) FROM generate_series(1, ${themeCount}) g),
  ${themeCount}, '${HEX64}', '${HEX64}', '${HEX64}'
);

INSERT INTO tli_study_origin_manifests (id, study_contract_id, forecast_origin_manifest_id, payload_sha256)
VALUES (${ns('study-origin')}, ${sharedContract}, ${ns('forecast-origin')}, '${HEX64}');

-- One partial DataLab run per theme (20 interest observations) and one News run per theme (14 obs).
INSERT INTO tli_collection_runs (
  id, source, contract_version, request_window_start, request_window_end, request_payload,
  response_payload, request_sha256, response_sha256, keyword_group_hash, expected_universe_hash,
  expected_keys_sha256, expected_row_count, observed_row_count, source_max_date, requested_at,
  collected_at, completed_at, status, failure_summary
)
SELECT ${nsInterestRun}, 'naver_datalab', 'tli-collection-v1',
  DATE '2025-12-01', DATE '${originDate}', '{}'::jsonb, '{}'::jsonb, '${HEX64}', '${HEX64}', '${HEX64}',
  '${HEX64}', '${HEX64}', 20, 20, DATE '${originDate}', TIMESTAMPTZ '2026-01-05T01:00:00Z',
  TIMESTAMPTZ '2026-01-05T02:00:00Z', TIMESTAMPTZ '2026-01-05T03:00:00Z', 'partial', '{}'::jsonb
FROM generate_series(1, ${themeCount}) g;

INSERT INTO tli_collection_runs (
  id, source, contract_version, request_window_start, request_window_end, request_payload,
  response_payload, request_sha256, response_sha256, keyword_group_hash, expected_universe_hash,
  expected_keys_sha256, expected_row_count, observed_row_count, source_max_date, requested_at,
  collected_at, completed_at, status, failure_summary
)
SELECT ${nsNewsRun}, 'naver_news', 'tli-collection-v1',
  DATE '2025-12-01', DATE '${originDate}', '{}'::jsonb, '{}'::jsonb, '${HEX64}', '${HEX64}', '${HEX64}',
  '${HEX64}', '${HEX64}', 14, 14, DATE '${originDate}', TIMESTAMPTZ '2026-01-05T01:00:00Z',
  TIMESTAMPTZ '2026-01-05T02:00:00Z', TIMESTAMPTZ '2026-01-05T03:00:00Z', 'partial', '{}'::jsonb
FROM generate_series(1, ${themeCount}) g;

INSERT INTO tli_interest_observations (id, collection_run_id, theme_id, trading_date, source, raw_value, normalized, anchor_scaled_value, keyword_epoch)
SELECT md5('f1-d2|${label}|interest|' || g || '|' || d)::uuid, ${nsInterestRun},
  ${nsTheme}, DATE '2025-12-08' + (d - 1), 'naver_datalab', 50, 0.5, NULL, 1
FROM generate_series(1, ${themeCount}) g, generate_series(1, 20) d;

INSERT INTO tli_news_observations (id, collection_run_id, theme_id, article_date, article_count, query_hash, collected_at)
SELECT md5('f1-d2|${label}|news|' || g || '|' || d)::uuid, ${nsNewsRun},
  ${nsTheme}, DATE '2025-12-23' + (d - 1), 3, '${HEX64}', TIMESTAMPTZ '2026-01-05T02:00:00Z'
FROM generate_series(1, ${themeCount}) g, generate_series(1, 14) d;

INSERT INTO tli_forecast_origin_theme_inputs (
  forecast_origin_manifest_id, theme_id, keyword_group_spec, keyword_group_sha256,
  forecast_interest_run_id, forecast_interest_response_sha256, news_observation_ids, news_input_sha256,
  input_status, abstain_reason
)
SELECT ${ns('forecast-origin')}, ${nsTheme}, '{}'::jsonb, '${HEX64}',
  ${nsInterestRun}, '${HEX64}',
  (SELECT jsonb_agg(to_jsonb((md5('f1-d2|${label}|news|' || g || '|' || d)::uuid)::text)) FROM generate_series(1, 14) d),
  '${HEX64}', 'usable', NULL
FROM generate_series(1, ${themeCount}) g;

INSERT INTO tli_study_origin_theme_inputs (
  study_origin_manifest_id, theme_id, babl_observation_id, babl_input_sha256, babl_candidate_pool, babl_missing_reason
)
SELECT ${ns('study-origin')}, ${nsTheme}, NULL, NULL, NULL, 'no_matching_observation'
FROM generate_series(1, ${themeCount}) g;
COMMIT;`
  psqlExec(sql)
  return studyManifestId
}

// ---- Postgres-backed SupabaseConfirmatoryClient shim (executes real SQL, counts every statement) ----

const sqlLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`

const TS = (column: string): string => (
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
)
const D = (column: string): string => `to_char(${column}, 'YYYY-MM-DD')`

/** Fixed jsonb projection per table, matching the confirmatory parsers (nested joins included). */
const PROJECTIONS: Record<string, { readonly select: string; readonly from: string }> = {
  tli_study_origin_manifests: {
    select: `jsonb_build_object('id', t.id::text, 'payload_sha256', t.payload_sha256,
      'forecast_origin_manifest_id', t.forecast_origin_manifest_id::text,
      'study_contract', jsonb_build_object('id', sc.id::text, 'payload_sha256', sc.payload_sha256,
        'feature_contract_version', sc.feature_contract_version, 'feature_contract_sha256', sc.feature_contract_sha256,
        'babl_algorithm_version', sc.babl_algorithm_version, 'babl_comparison_spec_version', sc.babl_comparison_spec_version,
        'babl_evaluation_horizon_days', sc.babl_evaluation_horizon_days, 'babl_candidate_pool_rule', sc.babl_candidate_pool_rule))`,
    from: `tli_study_origin_manifests t JOIN tli_attention_study_contracts sc ON sc.id = t.study_contract_id`,
  },
  tli_study_origin_theme_inputs: {
    select: `jsonb_build_object('study_origin_manifest_id', t.study_origin_manifest_id::text, 'theme_id', t.theme_id::text,
      'babl_observation_id', t.babl_observation_id::text, 'babl_input_sha256', t.babl_input_sha256,
      'babl_candidate_pool', t.babl_candidate_pool, 'babl_missing_reason', t.babl_missing_reason)`,
    from: `tli_study_origin_theme_inputs t`,
  },
  tli_forecast_origin_manifests: {
    select: `jsonb_build_object('id', t.id::text, 'payload_sha256', t.payload_sha256, 'origin_date', ${D('t.origin_date')},
      'forecast_cutoff', ${TS('t.forecast_cutoff')}, 'expected_theme_ids', t.expected_theme_ids,
      'expected_theme_count', t.expected_theme_count)`,
    from: `tli_forecast_origin_manifests t`,
  },
  tli_forecast_origin_theme_inputs: {
    select: `jsonb_build_object('forecast_origin_manifest_id', t.forecast_origin_manifest_id::text, 'theme_id', t.theme_id::text,
      'keyword_group_sha256', t.keyword_group_sha256, 'forecast_interest_run_id', t.forecast_interest_run_id::text,
      'forecast_interest_response_sha256', t.forecast_interest_response_sha256, 'news_observation_ids', t.news_observation_ids,
      'news_input_sha256', t.news_input_sha256, 'input_status', t.input_status, 'abstain_reason', t.abstain_reason)`,
    from: `tli_forecast_origin_theme_inputs t`,
  },
  tli_collection_runs: {
    select: `jsonb_build_object('id', t.id::text, 'source', t.source, 'status', t.status,
      'response_sha256', t.response_sha256, 'keyword_group_hash', t.keyword_group_hash,
      'source_max_date', ${D('t.source_max_date')}, 'collected_at', ${TS('t.collected_at')},
      'completed_at', ${TS('t.completed_at')})`,
    from: `tli_collection_runs t`,
  },
  tli_interest_observations: {
    select: `jsonb_build_object('id', t.id::text, 'collection_run_id', t.collection_run_id::text, 'theme_id', t.theme_id::text,
      'trading_date', ${D('t.trading_date')}, 'raw_value', t.raw_value, 'normalized', t.normalized,
      'anchor_scaled_value', t.anchor_scaled_value)`,
    from: `tli_interest_observations t`,
  },
  tli_news_observations: {
    select: `jsonb_build_object('id', t.id::text, 'collection_run_id', t.collection_run_id::text, 'theme_id', t.theme_id::text,
      'article_date', ${D('t.article_date')}, 'article_count', t.article_count, 'query_hash', t.query_hash,
      'collected_at', ${TS('t.collected_at')})`,
    from: `tli_news_observations t`,
  },
  tli_babl_phase_observations: {
    select: `jsonb_build_object('id', t.id::text, 'collection_run_id', t.collection_run_id::text, 'theme_id', t.theme_id::text,
      'snapshot_date', ${D('t.snapshot_date')}, 'phase', t.phase, 'algorithm_version', t.algorithm_version,
      'comparison_spec_version', t.comparison_spec_version, 'evaluation_horizon_days', t.evaluation_horizon_days,
      'candidate_pool', t.candidate_pool, 'source_prediction_snapshot_id', t.source_prediction_snapshot_id::text,
      'computed_at', ${TS('t.computed_at')}, 'payload_hash', t.payload_hash,
      'source_run', jsonb_build_object('status', sr.status))`,
    from: `tli_babl_phase_observations t JOIN tli_collection_runs sr ON sr.id = t.collection_run_id`,
  },
}

interface QueryState {
  table: string
  eq: { column: string; value: string }[]
  in: { column: string; values: readonly string[] }[]
  order: { column: string; ascending: boolean }[]
  range: { from: number; to: number } | null
}

const createCountingClient = (log: string[]): SupabaseConfirmatoryClient => {
  const buildWhere = (state: QueryState): string => {
    const clauses: string[] = []
    for (const clause of state.eq) clauses.push(`t.${clause.column}::text = ${sqlLiteral(clause.value)}`)
    for (const clause of state.in) {
      const list = clause.values.length === 0 ? "''" : clause.values.map(sqlLiteral).join(', ')
      clauses.push(`t.${clause.column}::text IN (${list})`)
    }
    return clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`
  }
  const buildSql = (state: QueryState, single: boolean): string => {
    const projection = PROJECTIONS[state.table]
    if (projection === undefined) throw new Error(`no projection for ${state.table}`)
    const order = state.order.length === 0
      ? ''
      : ` ORDER BY ${state.order.map((clause) => `t.${clause.column} ${clause.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    const limit = single
      ? ' LIMIT 1'
      : state.range === null ? '' : ` LIMIT ${state.range.to - state.range.from + 1} OFFSET ${state.range.from}`
    return `SELECT (${projection.select}) FROM ${projection.from}${buildWhere(state)}${order}${limit};`
  }
  const execute = (state: QueryState, single: boolean): SupabaseConfirmatoryQueryResult => {
    const sql = buildSql(state, single)
    log.push(sql)
    const output = psqlExec(sql, true).replace(/\n$/, '')
    const rows = output.length === 0 ? [] : output.split('\n').map((line) => JSON.parse(line) as unknown)
    if (single) return { data: rows.at(0) ?? null, error: null }
    return { data: rows, error: null }
  }

  const makeQuery = (state: QueryState): SupabaseConfirmatoryQuery => {
    const query: SupabaseConfirmatoryQuery = {
      select: () => makeQuery(state),
      eq: (column, value) => makeQuery({ ...state, eq: [...state.eq, { column, value }] }),
      in: (column, values) => makeQuery({ ...state, in: [...state.in, { column, values }] }),
      order: (column, options) => makeQuery({ ...state, order: [...state.order, { column, ascending: options.ascending }] }),
      range: (from, to) => makeQuery({ ...state, range: { from, to } }),
      maybeSingle: () => ({ then: (onFulfilled) => Promise.resolve(execute(state, true)).then(onFulfilled) }),
      then: (onFulfilled, onRejected) => Promise.resolve(execute(state, false)).then(onFulfilled, onRejected),
    }
    return query
  }

  return {
    from: (table) => ({ select: () => makeQuery({ table, eq: [], in: [], order: [], range: null }) }),
  }
}

const countMethodCalls = (
  source: ConfirmatoryFeatureBatchDataSource,
): { source: ConfirmatoryFeatureBatchDataSource; calls: Record<string, number> } => {
  const calls: Record<string, number> = {}
  const wrapped = {} as ConfirmatoryFeatureBatchDataSource
  for (const key of Object.keys(source) as (keyof ConfirmatoryFeatureBatchDataSource)[]) {
    calls[key] = 0
    const original = source[key] as (...args: unknown[]) => unknown
    wrapped[key] = ((...args: unknown[]) => { calls[key] += 1; return original(...args) }) as never
  }
  return { source: wrapped, calls }
}

interface RunResult {
  readonly themeCount: number
  readonly config: { readonly pageSize: number; readonly idChunkSize: number }
  readonly methodCalls: Record<string, number>
  readonly totalMethodCalls: number
  readonly sqlStatements: number
  readonly serverLoggedStatements: number
  readonly snapshotCount: number
}

const countServerStatements = (marker: string): number => {
  const logs = run('docker', ['logs', CONTAINER])
  const haystack = `${logs.stdout}\n${logs.stderr}`
  const idx = haystack.lastIndexOf(marker)
  if (idx < 0) return -1
  const tail = haystack.slice(idx)
  // Every logged statement line contains `statement:` under log_statement=all.
  return (tail.match(/statement:/g) ?? []).length
}

const runLoader = async (input: {
  readonly themeCount: number
  readonly studyOriginManifestId: string
  readonly pageSize: number
  readonly idChunkSize: number
}): Promise<RunResult> => {
  const log: string[] = []
  const client = createCountingClient(log)
  const base = createSupabaseConfirmatoryFeatureBatchDataSource(client, {
    pageSize: input.pageSize,
    idChunkSize: input.idChunkSize,
  })
  const { source, calls } = countMethodCalls(base)
  const marker = `f1-d2-marker-${input.themeCount}-${input.pageSize}-${input.idChunkSize}-${Date.now()}`
  psqlExec(`SELECT ${sqlLiteral(marker)};`, true)
  const batch = await loadConfirmatoryFeatureBatch({ studyOriginManifestId: input.studyOriginManifestId }, source)
  const serverLoggedStatements = countServerStatements(marker)
  return {
    themeCount: input.themeCount,
    config: { pageSize: input.pageSize, idChunkSize: input.idChunkSize },
    methodCalls: calls,
    totalMethodCalls: Object.values(calls).reduce((sum, value) => sum + value, 0),
    sqlStatements: log.length,
    serverLoggedStatements,
    snapshotCount: batch.snapshots.length,
  }
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
}

const main = async (): Promise<void> => {
  const prodSchemaPath = process.argv[2]
  const outfile = process.argv[3]
  if (prodSchemaPath === undefined) throw new Error('usage: confirmatory-query-count-rehearsal.ts <prod-schema.sql> [outfile]')

  const serverVersion = startPostgres(prodSchemaPath)
  const results: RunResult[] = []
  try {
    const wide = { pageSize: 1_000_000, idChunkSize: 1_000_000 }
    const dflt = { pageSize: 1000, idChunkSize: 200 }

    const small = seedFixture({ label: 'n5', themeCount: 5, originDate: '2026-01-05', firstOriginDate: '2026-01-12' })
    const large = seedFixture({ label: 'n193', themeCount: 193, originDate: '2026-01-12', firstOriginDate: '2026-01-19' })

    results.push(await runLoader({ themeCount: 5, studyOriginManifestId: small, ...wide }))
    results.push(await runLoader({ themeCount: 5, studyOriginManifestId: small, ...dflt }))
    results.push(await runLoader({ themeCount: 193, studyOriginManifestId: large, ...wide }))
    results.push(await runLoader({ themeCount: 193, studyOriginManifestId: large, ...dflt }))

    const [wide5, dflt5, wide193, dflt193] = results

    // (1) The loader issues exactly 8 logical data-source reads regardless of theme count (no N+1).
    for (const result of results) {
      assert(result.totalMethodCalls === 8, `expected 8 data-source method calls, got ${result.totalMethodCalls}`)
      assert(Object.values(result.methodCalls).every((count) => count === 1), 'each data-source method must be called exactly once')
    }
    // (2) The wrapper SQL count agrees with Postgres's own log_statement=all server log.
    for (const result of results) {
      assert(result.serverLoggedStatements === result.sqlStatements,
        `server log (${result.serverLoggedStatements}) must match wrapper count (${result.sqlStatements})`)
    }
    // (3) With batch width >= data, the real statement count is IDENTICAL for 5 and 193 themes = literal O(1).
    assert(wide5.sqlStatements === wide193.sqlStatements,
      `wide-config statements must be theme-count invariant: 5=>${wide5.sqlStatements}, 193=>${wide193.sqlStatements}`)
    // (4) Even with default page/chunk sizes the 193-theme count is a small batched number, never ~193 (N+1).
    assert(dflt193.sqlStatements < 40, `default-config 193-theme statements must stay batched (<40), got ${dflt193.sqlStatements}`)
    assert(dflt193.sqlStatements >= dflt5.sqlStatements, 'default statements grow only via bounded pagination/chunking')
    assert(wide193.sqlStatements < dflt193.sqlStatements, 'a wider batch collapses the chunked reads')
    // (5) The loader really assembled every theme's snapshot from the batched reads.
    assert(wide193.snapshotCount === 193, `expected 193 snapshots, got ${wide193.snapshotCount}`)
    assert(wide5.snapshotCount === 5, `expected 5 snapshots, got ${wide5.snapshotCount}`)

    const receipt = {
      status: 'PASS' as const,
      image: IMAGE,
      serverVersion,
      logStatement: 'all',
      contract: 'batched-o1-confirmatory-loader',
      results,
      conclusions: {
        methodCallsInvariant: true,
        wideConfigStatementsInvariant: wide5.sqlStatements === wide193.sqlStatements,
        wideConfigStatements: wide193.sqlStatements,
        defaultConfigStatements193: dflt193.sqlStatements,
        naivePerThemeWouldBe: '>= 193 (one query per theme)',
        serverLogCrossCheck: 'wrapper count == log_statement=all count for every run',
      },
    }
    const rendered = JSON.stringify(receipt, null, 2)
    if (outfile !== undefined) writeFileSync(outfile, `${rendered}\n`)
    process.stdout.write(`${rendered}\n`)
  } finally {
    cleanup()
  }
}

main().catch((error: unknown) => {
  cleanup()
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
