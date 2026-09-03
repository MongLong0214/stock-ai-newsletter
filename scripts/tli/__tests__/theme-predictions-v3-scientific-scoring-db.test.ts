import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CYCLE_ID,
  FORECAST_ID,
  LABEL_ID,
  makeScientificScoringFixture,
  ORIGIN_ID,
} from './theme-predictions-v3-scientific-scoring.fixture'

interface QueryRecord {
  readonly table: string
  readonly eq: Readonly<Record<string, unknown>>
  readonly in: Readonly<Record<string, readonly unknown[]>>
  readonly order: string | null
  readonly range: readonly [number, number]
}

interface DbState {
  tables: Record<string, Record<string, unknown>[]>
  queries: QueryRecord[]
  rpcCalls: { readonly name: string; readonly args: Record<string, unknown> }[]
  terminalPredictionIds: Set<string>
  rejectScoreSha: boolean
}

const db = vi.hoisted<DbState>(() => ({
  tables: {},
  queries: [],
  rpcCalls: [],
  terminalPredictionIds: new Set(),
  rejectScoreSha: false,
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => {
  interface QueryResult {
    readonly data: Record<string, unknown>[]
    readonly error: null
  }
  interface QueryBuilder extends PromiseLike<QueryResult> {
    select(columns: string): QueryBuilder
    eq(column: string, value: unknown): QueryBuilder
    in(column: string, values: readonly unknown[]): QueryBuilder
    order(column: string): QueryBuilder
    range(from: number, to: number): QueryBuilder
    or(expression: string): QueryBuilder
    limit(count: number): QueryBuilder
  }

  const query = (table: string): QueryBuilder => {
    const equals = new Map<string, unknown>()
    const included = new Map<string, readonly unknown[]>()
    let orderColumn: string | null = null
    let range: readonly [number, number] = [0, 999]
    const builder: QueryBuilder = {
      select: () => builder,
      eq: (column, value) => {
        equals.set(column, value)
        return builder
      },
      in: (column, values) => {
        included.set(column, values)
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
      or: () => builder,
      limit: (count) => {
        range = [range[0], range[0] + count - 1]
        return builder
      },
      then: (onfulfilled, onrejected) => {
        db.queries.push({
          table,
          eq: Object.fromEntries(equals),
          in: Object.fromEntries(included),
          order: orderColumn,
          range,
        })
        const filtered = (db.tables[table] ?? []).filter((row) => (
          [...equals].every(([column, value]) => row[column] === value)
          && [...included].every(([column, values]) => values.includes(row[column]))
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

  return {
    supabaseAdmin: {
      from: vi.fn(query),
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ name, args })
        const canonical = args.p_score_canonical_json
        if (typeof canonical !== 'string') return { data: null, error: { message: 'missing canonical payload' } }
        const predictionId = (JSON.parse(canonical) as { prediction_id?: unknown }).prediction_id
        if (typeof predictionId !== 'string') return { data: null, error: { message: 'missing prediction id' } }
        if (db.rejectScoreSha) return { data: null, error: { message: 'score payload SHA mismatch' } }
        if (db.terminalPredictionIds.has(predictionId)) return { data: null, error: { message: 'already terminal' } }
        db.terminalPredictionIds.add(predictionId)
        return { data: predictionId, error: null }
      }),
    },
  }
})

const seedDb = (): void => {
  const fixture = makeScientificScoringFixture()
  db.tables = {
    tli_experiment_cycles: fixture.cycles.map((row) => ({ ...row })),
    tli_experiment_origin_manifests: fixture.origins.map((row) => ({ ...row })),
    tli_study_origin_manifests: fixture.studyOrigins.map((row) => ({ ...row })),
    tli_study_origin_eligibility_latest: fixture.studyOrigins.map((row) => ({
      study_origin_manifest_id: row.id,
      rule_version: 'origin-eligibility-v2',
      verdict: 'eligible',
    })),
    tli_forecast_origin_manifests: fixture.forecasts.map((row) => ({ ...row })),
    tli_evidence_artifacts: fixture.evidenceArtifacts.map((row) => ({ ...row })),
    tli_evidence_attestations: fixture.evidenceAttestations.map((row) => ({ ...row })),
    theme_predictions_v3: fixture.predictions.map((row) => ({ ...row })),
    theme_labels: fixture.labels.map((row) => ({ ...row })),
  }
}

beforeEach(() => {
  seedDb()
  db.queries = []
  db.rpcCalls = []
  db.terminalPredictionIds.clear()
  db.rejectScoreSha = false
  vi.clearAllMocks()
})

describe('Todo 13 scientific scorer DB fixture', () => {
  it('loads the requested cycle/origin only and finalizes its exact two-role pair', async () => {
    const { scoreScientificThemePredictionsV3 } = await import('../comparison/theme-predictions-v3-scientific-scoring')

    const result = await scoreScientificThemePredictionsV3({
      cycleId: CYCLE_ID,
      originId: ORIGIN_ID,
      scoredAt: '2026-07-14T00:00:00.000Z',
    })

    expect(result).toMatchObject({ status: 'complete', completedFinalizations: 2 })
    expect(db.rpcCalls).toHaveLength(2)
    expect(db.rpcCalls.every((call) => call.name === 'finalize_tli_scientific_prediction_score')).toBe(true)
    expect(db.rpcCalls.map((call) => JSON.parse(String(call.args.p_score_canonical_json)))).toEqual([
      expect.objectContaining({ actual_label_id: LABEL_ID, score_status: 'scored' }),
      expect.objectContaining({ actual_label_id: LABEL_ID, score_status: 'scored' }),
    ])
    expect(db.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'theme_predictions_v3',
        eq: expect.objectContaining({ experiment_cycle_id: CYCLE_ID, experiment_origin_manifest_id: ORIGIN_ID }),
      }),
      expect.objectContaining({
        table: 'theme_labels',
        eq: expect.objectContaining({ forecast_origin_manifest_id: FORECAST_ID }),
      }),
    ]))
  })

  it('does not call the RPC when the requested forecast has no exact label', async () => {
    db.tables.theme_labels = (db.tables.theme_labels ?? []).filter((row) => row.id !== LABEL_ID)
    const { scoreScientificThemePredictionsV3 } = await import('../comparison/theme-predictions-v3-scientific-scoring')

    await expect(scoreScientificThemePredictionsV3({
      cycleId: CYCLE_ID,
      originId: ORIGIN_ID,
      scoredAt: '2026-07-14T00:00:00.000Z',
    })).rejects.toThrow(/exact label/)
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('keeps an RPC scoring SHA rejection at zero completed rows', async () => {
    db.rejectScoreSha = true
    const { scoreScientificThemePredictionsV3 } = await import('../comparison/theme-predictions-v3-scientific-scoring')

    await expect(scoreScientificThemePredictionsV3({
      cycleId: CYCLE_ID,
      originId: ORIGIN_ID,
      scoredAt: '2026-07-14T00:00:00.000Z',
    })).rejects.toMatchObject({ result: { status: 'partial', completedFinalizations: 0 } })
    expect(db.rpcCalls).toHaveLength(1)
    expect(db.terminalPredictionIds.size).toBe(0)
  })

  it('loads every deterministic prediction page beyond the Supabase row cap', async () => {
    const fixture = makeScientificScoringFixture()
    const candidate = fixture.predictions.find((row) => row.scientific_prediction_role === 'candidate')
    const comparator = fixture.predictions.find((row) => row.scientific_prediction_role === 'comparator')
    if (candidate === undefined || comparator === undefined) throw new Error('fixture roles missing')
    const themeIds = Array.from({ length: 501 }, (_, index) => `theme-${String(index).padStart(4, '0')}`)
    db.tables.tli_forecast_origin_manifests = fixture.forecasts.map((row) => ({
      ...row,
      expected_theme_ids: themeIds,
      expected_theme_count: themeIds.length,
    }))
    db.tables.theme_predictions_v3 = themeIds.flatMap((themeId, index) => [
      { ...candidate, id: `p-${String(index).padStart(4, '0')}-candidate`, theme_id: themeId },
      { ...comparator, id: `p-${String(index).padStart(4, '0')}-comparator`, theme_id: themeId },
    ])
    const { loadScientificPredictionScoringInput } = await import('../comparison/theme-predictions-v3-scientific-db')

    const loaded = await loadScientificPredictionScoringInput({
      cycleId: CYCLE_ID,
      originId: ORIGIN_ID,
      scoredAt: '2026-07-14T00:00:00.000Z',
    })

    expect(loaded.predictions).toHaveLength(1002)
    expect(db.queries.filter((query) => query.table === 'theme_predictions_v3')).toEqual([
      expect.objectContaining({ order: 'id', range: [0, 999] }),
      expect.objectContaining({ order: 'id', range: [1000, 1999] }),
    ])
  })

  it('loads every deterministic exact-label page so later-page duplicates cannot be hidden', async () => {
    const fixture = makeScientificScoringFixture()
    const label = fixture.labels.find((row) => row.id === LABEL_ID)
    if (label === undefined) throw new Error('fixture exact label missing')
    db.tables.theme_labels = Array.from({ length: 1002 }, (_, index) => ({
      ...label,
      id: `label-${String(index).padStart(4, '0')}`,
      theme_id: `theme-${String(index).padStart(4, '0')}`,
    }))
    const { loadScientificPredictionScoringInput } = await import('../comparison/theme-predictions-v3-scientific-db')

    const loaded = await loadScientificPredictionScoringInput({
      cycleId: CYCLE_ID,
      originId: ORIGIN_ID,
      scoredAt: '2026-07-14T00:00:00.000Z',
    })

    expect(loaded.labels).toHaveLength(1002)
    expect(db.queries.filter((query) => query.table === 'theme_labels')).toEqual([
      expect.objectContaining({ order: 'id', range: [0, 999] }),
      expect.objectContaining({ order: 'id', range: [1000, 1999] }),
    ])
  })
})
