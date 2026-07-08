import { beforeEach, describe, expect, it, vi } from 'vitest'

type DbRow = Record<string, unknown>

type QueryRecord = {
  readonly table: string
  readonly eqFilters: Readonly<Record<string, unknown>>
  readonly gteFilters: Readonly<Record<string, string | number>>
  readonly lteFilters: Readonly<Record<string, string | number>>
  readonly inFilters: Readonly<Record<string, readonly unknown[]>>
}

type OfflineDataMocks = {
  readonly rowsByTable: Map<string, DbRow[]>
  queries: QueryRecord[]
}

const offlineDataMocks = vi.hoisted<OfflineDataMocks>(() => ({
  rowsByTable: new Map<string, DbRow[]>(),
  queries: [],
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  type RangeResult = {
    readonly data: readonly DbRow[] | null
    readonly error: null
  }

  interface QueryState {
    readonly table: string
    readonly eqFilters: Map<string, unknown>
    readonly gteFilters: Map<string, string | number>
    readonly lteFilters: Map<string, string | number>
    readonly inFilters: Map<string, readonly unknown[]>
  }

  interface QueryBuilder extends PromiseLike<RangeResult> {
    select(columns: string): QueryBuilder
    eq(column: string, value: unknown): QueryBuilder
    gte(column: string, value: string | number): QueryBuilder
    lte(column: string, value: string | number): QueryBuilder
    in(column: string, values: readonly unknown[]): QueryBuilder
    order(column: string, options?: { readonly ascending?: boolean }): QueryBuilder
    range(from: number, to: number): Promise<RangeResult>
  }

  const isComparable = (value: unknown): value is string | number => (
    typeof value === 'string' || typeof value === 'number'
  )

  const resolveRows = (state: QueryState): DbRow[] => {
    const rows = offlineDataMocks.rowsByTable.get(state.table) ?? []
    return rows.filter((row) => (
      [...state.eqFilters].every(([column, value]) => row[column] === value)
      && [...state.gteFilters].every(([column, value]) => isComparable(row[column]) && row[column] >= value)
      && [...state.lteFilters].every(([column, value]) => isComparable(row[column]) && row[column] <= value)
      && [...state.inFilters].every(([column, values]) => values.includes(row[column]))
    ))
  }

  const recordQuery = (state: QueryState): void => {
    offlineDataMocks.queries.push({
      table: state.table,
      eqFilters: Object.fromEntries(state.eqFilters),
      gteFilters: Object.fromEntries(state.gteFilters),
      lteFilters: Object.fromEntries(state.lteFilters),
      inFilters: Object.fromEntries(state.inFilters),
    })
  }

  const createQueryBuilder = (table: string): QueryBuilder => {
    const state: QueryState = {
      table,
      eqFilters: new Map(),
      gteFilters: new Map(),
      lteFilters: new Map(),
      inFilters: new Map(),
    }
    const builder: QueryBuilder = {
      select(): QueryBuilder {
        return builder
      },
      eq(column: string, value: unknown): QueryBuilder {
        state.eqFilters.set(column, value)
        return builder
      },
      gte(column: string, value: string | number): QueryBuilder {
        state.gteFilters.set(column, value)
        return builder
      },
      lte(column: string, value: string | number): QueryBuilder {
        state.lteFilters.set(column, value)
        return builder
      },
      in(column: string, values: readonly unknown[]): QueryBuilder {
        state.inFilters.set(column, values)
        return builder
      },
      order(): QueryBuilder {
        return builder
      },
      async range(from: number, to: number): Promise<RangeResult> {
        recordQuery(state)
        return { data: resolveRows(state).slice(from, to + 1), error: null }
      },
      then<TResult1 = RangeResult, TResult2 = never>(
        onfulfilled?: ((value: RangeResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        recordQuery(state)
        return Promise.resolve({ data: resolveRows(state), error: null }).then(onfulfilled, onrejected)
      },
    }
    return builder
  }

  return {
    supabaseAdmin: {
      from: vi.fn(createQueryBuilder),
    },
  }
})

import { loadOfflineEvalInput } from '../offline-eval-data'

const featureDates = [
  '2026-06-23',
  '2026-06-24',
  '2026-06-25',
  '2026-06-26',
  '2026-06-29',
  '2026-06-30',
  '2026-07-01',
  '2026-07-02',
  '2026-07-03',
  '2026-07-06',
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
  '2026-07-10',
] as const

beforeEach(() => {
  offlineDataMocks.rowsByTable.clear()
  offlineDataMocks.queries = []
})

describe('offline eval feature-source loading', () => {
  it('threads exact-date production snapshots into M1 feature rows', async () => {
    offlineDataMocks.rowsByTable.set('theme_labels', [
      {
        theme_id: 'theme-a',
        base_date: '2026-07-10',
        label_type: 'gt_a',
        label_status: 'final',
        y_binary: true,
      },
    ])
    offlineDataMocks.rowsByTable.set('interest_metrics', featureDates.map((date, index) => ({
      theme_id: 'theme-a',
      time: date,
      raw_value: 10 + index,
      anchor_scaled_value: 20 + index,
    })))
    offlineDataMocks.rowsByTable.set('news_metrics', featureDates.map((date) => ({
      theme_id: 'theme-a',
      time: date,
      article_count: 2,
    })))
    offlineDataMocks.rowsByTable.set('theme_stocks', [
      { theme_id: 'theme-a', symbol: '005930', relevance: 0.9, is_active: true },
      { theme_id: 'theme-a', symbol: '000660', relevance: 0.8, is_active: true },
    ])
    offlineDataMocks.rowsByTable.set('stock_daily_prices', [
      { symbol: '005930', trade_date: '2026-07-03', close: 100, volume: 100 },
      { symbol: '005930', trade_date: '2026-07-10', close: 110, volume: 150 },
      { symbol: '000660', trade_date: '2026-07-03', close: 200, volume: 200 },
      { symbol: '000660', trade_date: '2026-07-10', close: 220, volume: 240 },
      { symbol: 'KOSPI', trade_date: '2026-07-03', close: 1000, volume: null },
      { symbol: 'KOSPI', trade_date: '2026-07-10', close: 1010, volume: null },
    ])
    offlineDataMocks.rowsByTable.set('theme_state_history_v2', [
      { theme_id: 'theme-a', effective_from: '2026-07-01', is_active: true, first_spike_date: '2026-07-01' },
    ])
    offlineDataMocks.rowsByTable.set('episode_registry_v1', [])
    offlineDataMocks.rowsByTable.set('prediction_snapshots_v2', [
      { theme_id: 'theme-a', snapshot_date: '2026-07-09', run_type: 'prod', phase: 'rising' },
      { theme_id: 'theme-a', snapshot_date: '2026-07-10', run_type: 'prod', phase: 'cooling' },
    ])

    const input = await loadOfflineEvalInput('2026-07-10', '2026-07-10')

    expect(input.featureRows).toHaveLength(1)
    expect(input.featureRows[0]?.values[10]).toBe(-1)
    expect(input.featureRows[0]?.missingFlags[10]).toBe(false)
    expect(input.snapshots).toEqual([
      { themeId: 'theme-a', snapshotDate: '2026-07-10', phase: 'cooling' },
    ])
    expect(offlineDataMocks.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'prediction_snapshots_v2',
        eqFilters: expect.objectContaining({ run_type: 'prod' }),
      }),
    ]))
  })
})
