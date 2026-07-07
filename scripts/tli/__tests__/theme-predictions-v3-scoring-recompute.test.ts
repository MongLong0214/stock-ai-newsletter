import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeQueryState {
  readonly table: string
  select?: string
  update?: Record<string, unknown>
  [key: `eq_${string}`]: unknown
}

const dbMocks = vi.hoisted(() => ({
  pendingRows: [] as Record<string, unknown>[],
  labelRows: [] as Record<string, unknown>[],
  scoredRowsByKey: new Map<string, Record<string, unknown>[]>(),
  updateCalls: [] as Record<string, unknown>[],
  batchUpsert: vi.fn(async () => 0),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const state = { table } as FakeQueryState
      const builder = {
        select: (cols: string) => { state.select = cols; return builder },
        eq: (col: string, val: unknown) => { state[`eq_${col}`] = val; return builder },
        in: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => { state.update = payload; return builder },
        then: (resolve: (value: { data?: unknown; error: null }) => void) => {
          if (table === 'theme_predictions_v3' && state.update) {
            dbMocks.updateCalls.push(state.update)
            return resolve({ error: null })
          }
          if (table === 'theme_predictions_v3' && state.eq_score_status === 'pending') {
            return resolve({ data: dbMocks.pendingRows, error: null })
          }
          if (table === 'theme_predictions_v3' && state.eq_score_status === 'scored') {
            const mapKey = `${state.eq_prediction_date}|${state.eq_model_version}`
            return resolve({ data: dbMocks.scoredRowsByKey.get(mapKey) ?? [], error: null })
          }
          if (table === 'theme_labels') {
            return resolve({ data: dbMocks.labelRows, error: null })
          }
          return resolve({ data: [], error: null })
        },
      }
      return builder
    }),
  },
}))

vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return { ...actual, batchUpsert: dbMocks.batchUpsert }
})

describe('evaluateThemePredictionsV3 — model_metrics_daily full recompute (C2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMocks.batchUpsert.mockResolvedValue(0)
    dbMocks.updateCalls.length = 0
    dbMocks.scoredRowsByKey.clear()
  })

  it('recomputes the full-day aggregate (not just this batch) when only one of three rows was newly scored', async () => {
    // This run's pending batch has just 1 row for 2026-07-06/b-abl-v1 — the other 2 rows for that
    // same (date, model) were already scored by a previous run.
    dbMocks.pendingRows = [
      { id: 'p3', theme_id: 'theme-c', prediction_date: '2026-07-06', model_version: 'b-abl-v1', p_rise: 0.9, abstain: false },
    ]
    dbMocks.labelRows = [
      { theme_id: 'theme-c', base_date: '2026-07-06', label_status: 'final', g_log_ratio: 0.3, y_binary: true },
    ]
    // Post-update DB state for the full day: 2 already-scored rows + the just-scored p3.
    dbMocks.scoredRowsByKey.set('2026-07-06|b-abl-v1', [
      { theme_id: 'theme-a', prediction_date: '2026-07-06', p_rise: 0.8, abstain: false, actual_y: true },
      { theme_id: 'theme-b', prediction_date: '2026-07-06', p_rise: 0.2, abstain: false, actual_y: false },
      { theme_id: 'theme-c', prediction_date: '2026-07-06', p_rise: 0.9, abstain: false, actual_y: true },
    ])

    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')
    const result = await evaluateThemePredictionsV3({ today: '2026-07-13' })

    expect(result.updates).toBe(1)
    expect(dbMocks.batchUpsert).toHaveBeenCalledTimes(1)
    const [, rows] = dbMocks.batchUpsert.mock.calls[0]
    expect(rows).toHaveLength(1)
    // n_scored reflects all 3 rows for the day, not just the 1 row scored in this batch.
    expect(rows[0]).toMatchObject({
      metric_date: '2026-07-06',
      model_version: 'b-abl-v1',
      n_scored: 3,
      coverage: 1,
    })
  })
})
