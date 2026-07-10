import { beforeEach, describe, expect, it, vi } from 'vitest'

const CYCLE_ID = '10000000-0000-4000-8000-000000000001'
const ORIGIN_A = '20000000-0000-4000-8000-000000000001'
const ORIGIN_B = '20000000-0000-4000-8000-000000000002'
const FORECAST_A = '30000000-0000-4000-8000-000000000001'
const FORECAST_B = '30000000-0000-4000-8000-000000000002'
const LABEL_A = '40000000-0000-4000-8000-000000000001'
const LABEL_B = '40000000-0000-4000-8000-000000000002'

interface QueryRecord {
  readonly table: string
  readonly eq: Readonly<Record<string, unknown>>
  readonly in: Readonly<Record<string, readonly unknown[]>>
  readonly order: string | null
  readonly range: readonly [number, number]
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as QueryRecord[],
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  interface QueryResult {
    readonly data: Record<string, unknown>[]
    readonly error: null
  }
  interface Builder extends PromiseLike<QueryResult> {
    select(columns: string): Builder
    eq(column: string, value: unknown): Builder
    in(column: string, values: readonly unknown[]): Builder
    order(column: string): Builder
    range(from: number, to: number): Builder
  }
  const from = (table: string): Builder => {
    const equals = new Map<string, unknown>()
    const includes = new Map<string, readonly unknown[]>()
    let orderColumn: string | null = null
    let range: readonly [number, number] = [0, 999]
    const builder: Builder = {
      select: () => builder,
      eq: (column, value) => {
        equals.set(column, value)
        return builder
      },
      in: (column, values) => {
        includes.set(column, values)
        return builder
      },
      order: (column) => {
        orderColumn = column
        return builder
      },
      range: (from, to) => {
        range = [from, to]
        return builder
      },
      then: (onfulfilled, onrejected) => {
        state.queries.push({
          table,
          eq: Object.fromEntries(equals),
          in: Object.fromEntries(includes),
          order: orderColumn,
          range,
        })
        const filtered = (state.tables[table] ?? []).filter((row) => (
          [...equals].every(([column, value]) => row[column] === value)
          && [...includes].every(([column, values]) => values.includes(row[column]))
        ))
        const column = orderColumn
        if (column !== null) {
          filtered.sort((left, right) => String(left[column]).localeCompare(String(right[column])))
        }
        const [from, to] = range
        const data = filtered.slice(from, Math.min(to + 1, from + 1000))
        return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
      },
    }
    return builder
  }
  return { supabaseAdmin: { from: vi.fn(from) } }
})

const prediction = (input: {
  readonly id: string
  readonly originId: string
  readonly themeId: string
  readonly date: string
  readonly role: 'candidate' | 'comparator'
  readonly labelId: string
}) => ({
  id: input.id,
  experiment_cycle_id: CYCLE_ID,
  experiment_origin_manifest_id: input.originId,
  theme_id: input.themeId,
  prediction_date: input.date,
  horizon_days: 5,
  labeler_version: 'gta-v2',
  scientific_prediction_role: input.role,
  p_rise: input.role === 'candidate' ? 0.8 : 0.6,
  ci_lower: input.role === 'candidate' ? 0.7 : 0.5,
  ci_upper: input.role === 'candidate' ? 0.9 : 0.7,
  abstain: false,
  actual_y: true,
  actual_label_id: input.labelId,
  score_status: 'scored',
  score_exclusion_reason: null,
})

const seed = (): void => {
  state.tables = {
    tli_experiment_cycles: [{ id: CYCLE_ID, planned_origins: 2, labeler_version: 'gta-v2' }],
    tli_experiment_origin_manifests: [
      { id: ORIGIN_A, cycle_id: CYCLE_ID, forecast_origin_manifest_id: FORECAST_A, sequence_no: 1, enrollment_role: 'confirmatory' },
      { id: ORIGIN_B, cycle_id: CYCLE_ID, forecast_origin_manifest_id: FORECAST_B, sequence_no: 2, enrollment_role: 'confirmatory' },
      { id: '20000000-0000-4000-8000-000000000003', cycle_id: CYCLE_ID, forecast_origin_manifest_id: '30000000-0000-4000-8000-000000000003', sequence_no: 3, enrollment_role: 'predecision_diagnostic' },
    ],
    tli_forecast_origin_manifests: [
      { id: FORECAST_A, origin_date: '2026-07-06', expected_theme_ids: ['theme-a'], expected_theme_count: 1 },
      { id: FORECAST_B, origin_date: '2026-07-13', expected_theme_ids: ['theme-b'], expected_theme_count: 1 },
    ],
    theme_predictions_v3: [
      prediction({ id: 'pa-c', originId: ORIGIN_A, themeId: 'theme-a', date: '2026-07-06', role: 'candidate', labelId: LABEL_A }),
      prediction({ id: 'pa-b', originId: ORIGIN_A, themeId: 'theme-a', date: '2026-07-06', role: 'comparator', labelId: LABEL_A }),
      prediction({ id: 'pb-c', originId: ORIGIN_B, themeId: 'theme-b', date: '2026-07-13', role: 'candidate', labelId: LABEL_B }),
      prediction({ id: 'pb-b', originId: ORIGIN_B, themeId: 'theme-b', date: '2026-07-13', role: 'comparator', labelId: LABEL_B }),
    ],
    model_registry: [
      { model_version: 'public-v1', status: 'champion', promoted_at: '2026-05-01T00:00:00.000Z' },
      { model_version: 'candidate-v2', status: 'challenger', promoted_at: null },
    ],
  }
}

beforeEach(() => {
  seed()
  state.queries = []
  vi.clearAllMocks()
})

describe('Todo 13 scientific gate input DB fixture', () => {
  it('builds only from the requested cycle planned confirmatory origins', async () => {
    const { buildScientificPromotionGateInputFromDb } = await import('../gate-input-from-db')

    const result = await buildScientificPromotionGateInputFromDb({ cycleId: CYCLE_ID, asOfDate: '2026-07-20' })

    expect(result.completeness).toMatchObject({ ratio: 1, expectedPairCount: 2, exactPairedScoredCount: 2 })
    expect(result.gateInput.nEff).toBe(2)
    expect(state.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'theme_predictions_v3',
        eq: expect.objectContaining({ experiment_cycle_id: CYCLE_ID }),
      }),
      expect.objectContaining({
        table: 'tli_experiment_origin_manifests',
        eq: expect.objectContaining({ cycle_id: CYCLE_ID }),
      }),
    ]))
  })

  it('refuses to emit input after one planned theme loses a role', async () => {
    state.tables.theme_predictions_v3 = (state.tables.theme_predictions_v3 ?? []).filter((row) => row.id !== 'pb-b')
    const { buildScientificPromotionGateInputFromDb } = await import('../gate-input-from-db')

    await expect(buildScientificPromotionGateInputFromDb({ cycleId: CYCLE_ID, asOfDate: '2026-07-20' }))
      .rejects.toMatchObject({ report: { partial: true, ratio: 0.5 } })
  })

  it('loads every deterministic page when a complete gate input exceeds one thousand prediction rows', async () => {
    const themeIds = Array.from({ length: 501 }, (_, index) => `theme-${String(index).padStart(4, '0')}`)
    state.tables.tli_experiment_cycles = [{ id: CYCLE_ID, planned_origins: 1, labeler_version: 'gta-v2' }]
    state.tables.tli_experiment_origin_manifests = [
      { id: ORIGIN_A, cycle_id: CYCLE_ID, forecast_origin_manifest_id: FORECAST_A, sequence_no: 1, enrollment_role: 'confirmatory' },
    ]
    state.tables.tli_forecast_origin_manifests = [
      { id: FORECAST_A, origin_date: '2026-07-06', expected_theme_ids: themeIds, expected_theme_count: themeIds.length },
    ]
    state.tables.theme_predictions_v3 = themeIds.flatMap((themeId, index) => [
      prediction({ id: `p-${String(index).padStart(4, '0')}-candidate`, originId: ORIGIN_A, themeId, date: '2026-07-06', role: 'candidate', labelId: LABEL_A }),
      prediction({ id: `p-${String(index).padStart(4, '0')}-comparator`, originId: ORIGIN_A, themeId, date: '2026-07-06', role: 'comparator', labelId: LABEL_A }),
    ])
    const { buildScientificPromotionGateInputFromDb } = await import('../gate-input-from-db')

    const result = await buildScientificPromotionGateInputFromDb({ cycleId: CYCLE_ID, asOfDate: '2026-07-20' })

    expect(result.completeness).toMatchObject({ ratio: 1, exactPairedScoredCount: 501 })
    expect(state.queries.filter((query) => query.table === 'theme_predictions_v3')).toEqual([
      expect.objectContaining({ order: 'id', range: [0, 999] }),
      expect.objectContaining({ order: 'id', range: [1000, 1999] }),
    ])
  })
})
