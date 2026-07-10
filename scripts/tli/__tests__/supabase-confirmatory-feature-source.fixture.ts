import type {
  SupabaseConfirmatoryClient,
  SupabaseConfirmatoryQuery,
  SupabaseConfirmatoryQueryResult,
} from '@/scripts/tli/features/supabase-confirmatory-feature-source'

export const VALID_SHA256 = 'a'.repeat(64)

type RowOverrides = Readonly<Record<string, unknown>>

export const makeForecastOriginRow = (overrides: RowOverrides = {}) => ({
  id: 'forecast-origin-1',
  payload_sha256: VALID_SHA256,
  origin_date: '2026-06-01',
  forecast_cutoff: '2026-06-01T08:00:00Z',
  expected_theme_ids: ['theme-1'],
  expected_theme_count: 1,
  ...overrides,
})

export const makeCollectionRunRow = (overrides: RowOverrides = {}) => ({
  id: 'run-1',
  source: 'naver_datalab',
  status: 'complete',
  response_sha256: VALID_SHA256,
  keyword_group_hash: VALID_SHA256,
  source_max_date: '2026-06-01',
  collected_at: '2026-06-01T08:00:00Z',
  completed_at: '2026-06-01T08:01:00Z',
  ...overrides,
})

export const makeNewsObservationRow = (overrides: RowOverrides = {}) => ({
  id: 'news-1',
  collection_run_id: 'news-run-1',
  theme_id: 'theme-1',
  article_date: '2026-06-01',
  article_count: 0,
  query_hash: VALID_SHA256,
  collected_at: '2026-06-01T08:00:00Z',
  ...overrides,
})

export const makeBablObservationRow = (overrides: RowOverrides = {}) => ({
  id: 'babl-1',
  collection_run_id: 'babl-run-1',
  theme_id: 'theme-1',
  snapshot_date: '2026-06-01',
  phase: 'rising',
  algorithm_version: 'babl-v4',
  comparison_spec_version: 'comparison-v4-spec-v1',
  evaluation_horizon_days: 14,
  candidate_pool: 'prod',
  source_prediction_snapshot_id: 'snapshot-1',
  computed_at: '2026-06-01T08:00:00Z',
  payload_hash: VALID_SHA256,
  source_run: { status: 'complete' },
  ...overrides,
})

export const makeStudyOriginRow = (
  overrides: RowOverrides = {},
  contractOverrides: RowOverrides = {},
) => ({
  id: 'study-origin-1',
  payload_sha256: VALID_SHA256,
  forecast_origin_manifest_id: 'forecast-origin-1',
  study_contract: {
    id: 'study-contract-1',
    payload_sha256: VALID_SHA256,
    feature_contract_version: 'tli-attention-v2-f1',
    feature_contract_sha256: VALID_SHA256,
    babl_algorithm_version: 'babl-v4',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
    babl_candidate_pool_rule: 'source_prod_run_v1',
    ...contractOverrides,
  },
  ...overrides,
})

export const makeStudyThemeRow = (overrides: RowOverrides = {}) => ({
  study_origin_manifest_id: 'study-origin-1',
  theme_id: 'theme-1',
  babl_observation_id: null,
  babl_input_sha256: null,
  babl_candidate_pool: null,
  babl_missing_reason: 'no_matching_observation',
  ...overrides,
})

export const makeForecastThemeRow = (overrides: RowOverrides = {}) => ({
  forecast_origin_manifest_id: 'forecast-origin-1',
  theme_id: 'theme-1',
  keyword_group_sha256: VALID_SHA256,
  forecast_interest_run_id: null,
  forecast_interest_response_sha256: null,
  news_observation_ids: [],
  news_input_sha256: null,
  input_status: 'abstain',
  abstain_reason: 'missing_interest',
  ...overrides,
})

export type QueryCall = {
  readonly table: string
  readonly operation: 'from' | 'select' | 'eq' | 'in' | 'order' | 'range' | 'maybeSingle'
  readonly column?: string
  readonly value?: unknown
}

class FakeQuery implements SupabaseConfirmatoryQuery {
  private inColumn: string | null = null
  private inValues: readonly string[] = []
  private rangeStart: number | null = null
  private rangeEnd: number | null = null

  constructor(
    private readonly table: string,
    private readonly response: SupabaseConfirmatoryQueryResult,
    private readonly calls: QueryCall[],
  ) {}

  select(columns: string): SupabaseConfirmatoryQuery {
    this.calls.push({ table: this.table, operation: 'select', value: columns })
    return this
  }

  eq(column: string, value: string): SupabaseConfirmatoryQuery {
    this.calls.push({ table: this.table, operation: 'eq', column, value })
    return this
  }

  in(column: string, values: readonly string[]): SupabaseConfirmatoryQuery {
    this.calls.push({ table: this.table, operation: 'in', column, value: [...values] })
    this.inColumn = column
    this.inValues = values
    return this
  }

  order(column: string, options: { readonly ascending: boolean }): SupabaseConfirmatoryQuery {
    this.calls.push({ table: this.table, operation: 'order', column, value: options })
    return this
  }

  range(from: number, to: number): SupabaseConfirmatoryQuery {
    this.calls.push({ table: this.table, operation: 'range', value: [from, to] })
    this.rangeStart = from
    this.rangeEnd = to
    return this
  }

  maybeSingle(): Promise<SupabaseConfirmatoryQueryResult> {
    this.calls.push({ table: this.table, operation: 'maybeSingle' })
    return Promise.resolve(this.response)
  }

  then<TResult1 = SupabaseConfirmatoryQueryResult, TResult2 = never>(
    onfulfilled?: ((value: SupabaseConfirmatoryQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected)
  }

  private result(): SupabaseConfirmatoryQueryResult {
    if (!Array.isArray(this.response.data)) return this.response
    const filtered = this.inColumn === null
      ? this.response.data
      : this.response.data.filter((row) => {
        if (typeof row !== 'object' || row === null || this.inColumn === null) return false
        if (!(this.inColumn in row)) return false
        const value = row[this.inColumn]
        return typeof value === 'string' && this.inValues.includes(value)
      })
    const ranged = this.rangeStart === null || this.rangeEnd === null
      ? filtered
      : filtered.slice(this.rangeStart, this.rangeEnd + 1)
    return { data: ranged, error: this.response.error }
  }
}

export class FakeClient implements SupabaseConfirmatoryClient {
  readonly calls: QueryCall[] = []

  constructor(private readonly responses: Readonly<Record<string, SupabaseConfirmatoryQueryResult>>) {}

  from(table: string): SupabaseConfirmatoryQuery {
    this.calls.push({ table, operation: 'from' })
    return new FakeQuery(
      table,
      this.responses[table] ?? { data: [], error: null },
      this.calls,
    )
  }
}
