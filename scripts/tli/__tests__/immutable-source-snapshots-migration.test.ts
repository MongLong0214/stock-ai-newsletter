import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase/migrations/046_tli_immutable_source_snapshots.sql')
const tables = [
  'tli_collection_runs', 'tli_interest_observations', 'tli_news_observations',
  'tli_babl_phase_observations', 'tli_attention_study_contracts',
  'tli_forecast_origin_manifests', 'tli_forecast_origin_theme_inputs',
  'tli_study_origin_manifests', 'tli_study_origin_theme_inputs',
] as const
type TableName = (typeof tables)[number]

const expectedColumns: Record<TableName, readonly string[]> = {
  tli_collection_runs: 'id source contract_version request_window_start request_window_end request_payload response_payload request_sha256 response_sha256 keyword_group_hash expected_universe_hash expected_keys_sha256 expected_row_count observed_row_count source_max_date requested_at collected_at completed_at status failure_summary'.split(' '),
  tli_interest_observations: 'id collection_run_id theme_id trading_date source raw_value normalized anchor_scaled_value keyword_epoch'.split(' '),
  tli_news_observations: 'id collection_run_id theme_id article_date article_count query_hash collected_at'.split(' '),
  tli_babl_phase_observations: 'id collection_run_id theme_id snapshot_date phase algorithm_version candidate_pool comparison_spec_version evaluation_horizon_days source_prediction_snapshot_id computed_at payload_hash'.split(' '),
  tli_attention_study_contracts: 'id contract_version locked_at first_origin_date babl_algorithm_version babl_comparison_spec_version babl_evaluation_horizon_days babl_candidate_pool_rule babl_control_row_id babl_control_sha256 labeler_version label_contract_sha256 feature_contract_version feature_contract_sha256 payload_sha256 git_commit_sha git_blob_sha repo_relative_path verifier_version verifier_code_sha verified_at created_at'.split(' '),
  tli_forecast_origin_manifests: 'id manifest_version origin_date forecast_cutoff expected_theme_ids expected_theme_count expected_universe_sha256 keyword_group_manifest_sha256 payload_sha256 created_at'.split(' '),
  tli_forecast_origin_theme_inputs: 'forecast_origin_manifest_id theme_id keyword_group_spec keyword_group_sha256 forecast_interest_run_id forecast_interest_response_sha256 news_observation_ids news_input_sha256 input_status abstain_reason'.split(' '),
  tli_study_origin_manifests: 'id study_contract_id forecast_origin_manifest_id payload_sha256 created_at'.split(' '),
  tli_study_origin_theme_inputs: 'study_origin_manifest_id theme_id babl_observation_id babl_input_sha256 babl_candidate_pool babl_missing_reason'.split(' '),
}

let sql = ''
let normalizedSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
})

function tableSql(table: TableName): string {
  const match = normalizedSql.match(new RegExp(`CREATE TABLE public\\.${table} \\((.*?)\\);`))
  expect(match, `missing CREATE TABLE public.${table}`).not.toBeNull()
  return match?.[1] ?? ''
}

function rawTableColumns(table: TableName): string[] {
  const match = sql.match(new RegExp(`CREATE TABLE public\\.${table} \\(\\n([\\s\\S]*?)\\n\\);`))
  expect(match, `missing raw CREATE TABLE public.${table}`).not.toBeNull()
  return [...(match?.[1] ?? '').matchAll(
    /^ {2}([a-z][a-z0-9_]*) (?:UUID|TEXT|DATE|JSONB|INTEGER|TIMESTAMPTZ|NUMERIC)\b/gm,
  )].map((column) => column[1])
}

function expectFragments(table: TableName, fragments: readonly string[]): void {
  const body = tableSql(table)
  for (const fragment of fragments) expect(body).toContain(fragment)
}

const sha = (column: string) => `${column} ~ '^[0-9a-f]{64}$'`

describe('TLI immutable source snapshot migration', () => {
  it('is atomic and declares only the exact 4+1+2+2 tables and columns', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect([...normalizedSql.matchAll(/CREATE TABLE public\.(tli_[a-z_]+) \(/g)]
      .map(([, name]) => name)).toEqual(tables)
    for (const table of tables) expect(rawTableColumns(table)).toEqual(expectedColumns[table])
  })

  it('defines every exact source PK, FK, UNIQUE, CHECK, and completeness guard', () => {
    expectFragments('tli_collection_runs', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      "source TEXT NOT NULL CHECK (source IN ('naver_datalab','naver_news','babl_phase'))",
      "status TEXT NOT NULL CHECK (status IN ('complete','partial','failed'))",
      'CHECK (request_window_start <= request_window_end)',
      'CHECK (requested_at <= collected_at AND collected_at <= completed_at)',
      'CHECK ((response_payload IS NULL) = (response_sha256 IS NULL))',
      "CHECK (status <> 'complete' OR expected_row_count = observed_row_count)",
      'expected_row_count INTEGER NOT NULL CHECK (expected_row_count >= 0)',
      'observed_row_count INTEGER NOT NULL CHECK (observed_row_count >= 0)',
      'source_max_date BETWEEN request_window_start AND request_window_end',
      "(status = 'complete' AND failure_summary IS NULL)",
    ])
    for (const column of ['request_sha256', 'expected_universe_hash', 'expected_keys_sha256'])
      expect(tableSql('tli_collection_runs')).toContain(sha(column))
    expect(tableSql('tli_collection_runs')).toContain(`response_sha256 TEXT CHECK (response_sha256 IS NULL OR ${sha('response_sha256')})`)
    expect(tableSql('tli_collection_runs')).toContain(`keyword_group_hash TEXT CHECK (keyword_group_hash IS NULL OR ${sha('keyword_group_hash')})`)
    expectFragments('tli_interest_observations', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      "source TEXT NOT NULL CHECK (source = 'naver_datalab')",
      'keyword_epoch INTEGER NOT NULL CHECK (keyword_epoch >= 1)',
      'UNIQUE (collection_run_id, theme_id, trading_date, source)',
    ])
    expectFragments('tli_news_observations', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      'article_count INTEGER NOT NULL CHECK (article_count >= 0)',
      `query_hash TEXT NOT NULL CHECK (${sha('query_hash')})`,
      'UNIQUE (collection_run_id, theme_id, article_date)',
    ])
    expectFragments('tli_babl_phase_observations', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'collection_run_id UUID NOT NULL REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      'source_prediction_snapshot_id UUID NOT NULL REFERENCES public.prediction_snapshots_v2(id) ON DELETE RESTRICT',
      'evaluation_horizon_days INTEGER NOT NULL CHECK (evaluation_horizon_days > 0)',
      `payload_hash TEXT NOT NULL CHECK (${sha('payload_hash')})`,
      'UNIQUE (collection_run_id, theme_id, snapshot_date, algorithm_version, candidate_pool, comparison_spec_version, evaluation_horizon_days)',
    ])
    expect(normalizedSql).toContain('CREATE CONSTRAINT TRIGGER validate_tli_collection_run_after_insert')
    expect(normalizedSql).toContain('complete collection run does not contain the exact expected key set')
  })

  it('defines the exact study lock PK, FK, CHECKs, SHA fields, and fail-closed RPC', () => {
    expectFragments('tli_attention_study_contracts', [
      'id UUID PRIMARY KEY',
      "contract_version TEXT NOT NULL UNIQUE CHECK (contract_version = 'tli-attention-study-v1')",
      "babl_comparison_spec_version TEXT NOT NULL CHECK (babl_comparison_spec_version = 'comparison-v4-spec-v1')",
      'babl_evaluation_horizon_days INTEGER NOT NULL CHECK (babl_evaluation_horizon_days = 14)',
      "babl_candidate_pool_rule TEXT NOT NULL CHECK (babl_candidate_pool_rule = 'source_prod_run_v1')",
      'babl_control_row_id UUID NOT NULL REFERENCES public.comparison_v4_control(id) ON DELETE RESTRICT',
      "labeler_version TEXT NOT NULL CHECK (labeler_version = 'gta-v2')",
      "feature_contract_version TEXT NOT NULL CHECK (feature_contract_version = 'tli-attention-v2-f1')",
      'CHECK (EXTRACT(ISODOW FROM first_origin_date) = 1)', 'CHECK (verified_at <= locked_at)',
      "locked_at < ((first_origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul')",
      "repo_relative_path = 'docs/evidence/tli-v3-scientific-rebuild/studies/' || id::text || '/study-contract.json'",
    ])
    for (const column of ['babl_control_sha256', 'label_contract_sha256',
      'feature_contract_sha256', 'payload_sha256', 'git_commit_sha', 'git_blob_sha',
      'verifier_code_sha']) expect(tableSql('tli_attention_study_contracts')).toContain(sha(column))
    expect(normalizedSql).toContain("v_payload ->> 'babl_control_row_id' IS DISTINCT FROM v_control.id::text")
    expect(normalizedSql).toContain("v_payload ->> 'babl_algorithm_version' IS DISTINCT FROM v_control.production_version")
    expect(normalizedSql).toContain('WHERE serving_enabled = true FOR UPDATE')
    expect(normalizedSql).not.toMatch(/FROM public\.(?:theme_labels|theme_predictions_v3|tli_experiment|tli_scoring)/)
  })

  it('defines exact forecast parent-child keys, checks, hashes, and idempotency', () => {
    expectFragments('tli_forecast_origin_manifests', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()', 'UNIQUE (manifest_version, origin_date)',
      "CHECK (jsonb_typeof(expected_theme_ids) = 'array')",
      'CHECK (expected_theme_count = jsonb_array_length(expected_theme_ids))',
      'CHECK (EXTRACT(ISODOW FROM origin_date) = 1)',
      "CHECK (forecast_cutoff = ((origin_date::timestamp + TIME '18:00:00') AT TIME ZONE 'Asia/Seoul'))",
    ])
    expectFragments('tli_forecast_origin_theme_inputs', [
      'forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      'forecast_interest_run_id UUID REFERENCES public.tli_collection_runs(id) ON DELETE RESTRICT',
      "input_status TEXT NOT NULL CHECK (input_status IN ('usable','abstain'))",
      'PRIMARY KEY (forecast_origin_manifest_id, theme_id)',
      "CHECK (jsonb_typeof(keyword_group_spec) = 'object')",
      "CHECK (jsonb_typeof(news_observation_ids) = 'array')", "CHECK ((input_status = 'usable'",
    ])
    for (const column of ['expected_universe_sha256', 'keyword_group_manifest_sha256', 'payload_sha256'])
      expect(tableSql('tli_forecast_origin_manifests')).toContain(sha(column))
    expect(tableSql('tli_forecast_origin_theme_inputs')).toContain(sha('keyword_group_sha256'))
    expect(tableSql('tli_forecast_origin_theme_inputs')).toContain(`forecast_interest_response_sha256 TEXT CHECK (forecast_interest_response_sha256 IS NULL OR ${sha('forecast_interest_response_sha256')})`)
    expect(tableSql('tli_forecast_origin_theme_inputs')).toContain(`news_input_sha256 TEXT CHECK (news_input_sha256 IS NULL OR ${sha('news_input_sha256')})`)
    expect(normalizedSql).toContain('same version/date has a different payload')
    expect(normalizedSql).toContain("v_payload ->> 'forecast_cutoff' IS DISTINCT FROM")
    expect(normalizedSql).toContain('v_keyword_group_payload IS DISTINCT FROM')
  })

  it('enforces fresh 20-day interest and ordered explicit-zero 14-trading-day news', () => {
    expect(normalizedSql).toContain("symbol = 'KOSPI' AND trade_date < v_origin_date")
    expect(normalizedSql).toContain('source_max_date >= v_previous_trading_date')
    expect(normalizedSql).toContain('r.source_max_date >= v_previous_trading_date')
    expect(normalizedSql).toContain('v_interest_dates IS DISTINCT FROM v_required_interest_dates')
    expect(normalizedSql).toContain('LIMIT 20')
    expect(normalizedSql).toContain('LIMIT 14')
    expect(normalizedSql).toContain('FROM unnest(v_required_news_dates) AS required_dates(article_date)')
    expect(normalizedSql).toContain('ORDER BY news.collected_at DESC, news.id DESC LIMIT 1')
    expect(normalizedSql).not.toContain('generate_series(0, 13)')
  })

  it('defines exact study-origin PK/FK/UNIQUE and B-Abl XOR/source binding', () => {
    expectFragments('tli_study_origin_manifests', [
      'id UUID PRIMARY KEY DEFAULT gen_random_uuid()',
      'study_contract_id UUID NOT NULL REFERENCES public.tli_attention_study_contracts(id) ON DELETE RESTRICT',
      'forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT',
      'UNIQUE (study_contract_id, forecast_origin_manifest_id)',
      `payload_sha256 TEXT NOT NULL CHECK (${sha('payload_sha256')})`,
    ])
    expectFragments('tli_study_origin_theme_inputs', [
      'study_origin_manifest_id UUID NOT NULL REFERENCES public.tli_study_origin_manifests(id) ON DELETE RESTRICT',
      'theme_id UUID NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT',
      'babl_observation_id UUID REFERENCES public.tli_babl_phase_observations(id) ON DELETE RESTRICT',
      "babl_missing_reason TEXT CHECK (babl_missing_reason IN ('no_matching_observation','multiple_matching_observations','source_run_not_complete','source_after_cutoff','source_pool_mismatch'))",
      'PRIMARY KEY (study_origin_manifest_id, theme_id)',
      `babl_input_sha256 TEXT CHECK (babl_input_sha256 IS NULL OR ${sha('babl_input_sha256')})`,
      '(babl_observation_id IS NOT NULL AND babl_input_sha256 IS NOT NULL AND babl_candidate_pool IS NOT NULL AND babl_missing_reason IS NULL)',
      '(babl_observation_id IS NULL AND babl_input_sha256 IS NULL AND babl_candidate_pool IS NULL AND babl_missing_reason IS NOT NULL)',
    ])
    expect(normalizedSql).toContain('source_snapshot.phase IS DISTINCT FROM observation.phase')
    expect(normalizedSql).toContain('source_snapshot.created_at IS DISTINCT FROM observation.computed_at')
    expect(normalizedSql).toContain("v_theme_input ->> 'babl_input_sha256' IS DISTINCT FROM v_expected_input_sha256")
  })

  it('makes every table RLS-private, indexed, append-only, and least-privilege', () => {
    for (const table of tables) {
      expect(normalizedSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(normalizedSql).toContain(`CREATE POLICY service_role_all_${table} ON public.${table} FOR ALL TO service_role USING (true) WITH CHECK (true)`)
      expect(normalizedSql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`)
      expect(normalizedSql).toContain(`BEFORE UPDATE OR DELETE OR TRUNCATE ON public.${table}`)
    }
    expect(normalizedSql).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${tables.map((table) => `public.${table}`).join(', ')} FROM service_role`)
    expect(normalizedSql).toContain('REVOKE INSERT ON TABLE public.tli_attention_study_contracts, public.tli_forecast_origin_manifests, public.tli_forecast_origin_theme_inputs, public.tli_study_origin_manifests, public.tli_study_origin_theme_inputs FROM service_role')
    expect(normalizedSql).toContain('GRANT INSERT ON TABLE public.tli_collection_runs, public.tli_interest_observations, public.tli_news_observations, public.tli_babl_phase_observations TO service_role')
    expect(normalizedSql).toContain(`GRANT SELECT ON TABLE ${tables.map((table) => `public.${table}`).join(', ')} TO service_role`)
    expect(normalizedSql).toContain("USING ERRCODE = '42501'")
    expect(normalizedSql).not.toMatch(/BEFORE INSERT OR UPDATE OR DELETE/)
    const indexes = [
      'CREATE INDEX idx_tli_interest_observations_theme_date ON public.tli_interest_observations (theme_id, trading_date DESC, collection_run_id)',
      'CREATE INDEX idx_tli_collection_runs_source_latest ON public.tli_collection_runs (source, status, keyword_group_hash, source_max_date DESC, completed_at DESC, id DESC)',
      'CREATE INDEX idx_tli_news_observations_theme_date ON public.tli_news_observations (theme_id, article_date, query_hash, collected_at DESC, id DESC)',
      'CREATE INDEX idx_tli_babl_phase_observations_theme_date ON public.tli_babl_phase_observations (theme_id, snapshot_date DESC, algorithm_version, comparison_spec_version, evaluation_horizon_days, candidate_pool)',
      'CREATE INDEX idx_tli_babl_phase_observations_source_snapshot ON public.tli_babl_phase_observations (source_prediction_snapshot_id)',
      'CREATE INDEX idx_tli_attention_study_contracts_control ON public.tli_attention_study_contracts (babl_control_row_id)',
      'CREATE INDEX idx_tli_forecast_origin_manifests_origin ON public.tli_forecast_origin_manifests (origin_date DESC)',
      'CREATE INDEX idx_tli_forecast_origin_theme_inputs_theme ON public.tli_forecast_origin_theme_inputs (theme_id, forecast_origin_manifest_id)',
      'CREATE INDEX idx_tli_forecast_origin_theme_inputs_interest_run ON public.tli_forecast_origin_theme_inputs (forecast_interest_run_id) WHERE forecast_interest_run_id IS NOT NULL',
      'CREATE INDEX idx_tli_study_origin_manifests_forecast ON public.tli_study_origin_manifests (forecast_origin_manifest_id)',
      'CREATE INDEX idx_tli_study_origin_theme_inputs_theme ON public.tli_study_origin_theme_inputs (theme_id, study_origin_manifest_id)',
      'CREATE INDEX idx_tli_study_origin_theme_inputs_babl ON public.tli_study_origin_theme_inputs (babl_observation_id) WHERE babl_observation_id IS NOT NULL',
    ]
    for (const index of indexes) expect(normalizedSql).toContain(index)
  })

  it('exposes only exact service-role RPCs and rejects NULL/noncanonical attestations', () => {
    const signatures = [
      'public.lock_tli_attention_study_contract(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)',
      'public.create_tli_forecast_origin_manifest(TEXT, TEXT)',
      'public.bind_tli_study_origin(TEXT, TEXT)',
    ]
    for (const signature of signatures) {
      expect(normalizedSql).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`)
      expect(normalizedSql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`)
    }
    expect([...normalizedSql.matchAll(/CREATE OR REPLACE FUNCTION public\.(lock_tli_attention_study_contract|create_tli_forecast_origin_manifest|bind_tli_study_origin)\(/g)]).toHaveLength(3)
    expect(normalizedSql).toContain('p_canonical_json IS NULL OR p_expected_sha256 IS NULL')
    expect(normalizedSql).toContain('tli_json_has_duplicate_keys')
    expect(normalizedSql).toContain("jsonb_typeof(v_theme_input -> 'keyword_group_canonical_json') IS DISTINCT FROM 'string'")
    for (const token of [
      "v_payload ->> 'first_origin_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
      "v_payload ->> 'first_origin_date' IS DISTINCT FROM to_char(v_first_origin_date, 'YYYY-MM-DD')",
      "v_payload ->> 'origin_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
      "v_payload ->> 'origin_date' IS DISTINCT FROM to_char(v_origin_date, 'YYYY-MM-DD')",
      "v_theme_input ->> 'forecast_interest_run_id' IS DISTINCT FROM v_interest_run_id::text",
      "v_payload ->> 'study_contract_id' IS DISTINCT FROM v_study_contract_id::text",
    ]) expect(normalizedSql).toContain(token)
    for (const date of ['trading_date', 'article_date', 'snapshot_date',
      'v_control.hold_report_date', 'v_origin_date']) {
      expect(normalizedSql).toContain(`to_char(${date}, 'YYYY-MM-DD')`)
    }
    expect(normalizedSql).not.toMatch(/(?:trading_date|article_date|snapshot_date|hold_report_date|origin_date)::text/)
    expect(normalizedSql).not.toContain('jsonb_object_length')
  })

  it('does not change current caches, collectors, or later Todo schemas', () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+public\.(?:interest_metrics|news_metrics|theme_stocks|theme_labels|theme_predictions_v3)/i)
    expect(sql).not.toMatch(/CREATE\s+TABLE\s+public\.theme_stock_membership_history/i)
    expect(sql).not.toMatch(/\bgta-v2\b.*(?:INSERT|UPDATE)\s+INTO\s+public\.theme_labels/is)
  })
})
