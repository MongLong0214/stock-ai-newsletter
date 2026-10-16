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
  labelOrder: vi.fn(),
  labelRange: vi.fn(),
  labelErrorFrom: null as number | null,
  scoredRowsByKey: new Map<string, Record<string, unknown>[]>(),
  updateCalls: [] as Record<string, unknown>[],
  legacyScopeCalls: 0,
  batchUpsert: vi.fn<(table: string, rows: Array<Record<string, unknown>>) => Promise<number>>(async () => 0),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const state = { table } as FakeQueryState
      const builder = {
        select: (cols: string) => { state.select = cols; return builder },
        is: (col: string, val: unknown) => {
          state[`eq_${col}`] = val
          if (table === 'theme_predictions_v3' && col === 'experiment_cycle_id' && val === null) {
            dbMocks.legacyScopeCalls++
          }
          return builder
        },
        eq: (col: string, val: unknown) => { state[`eq_${col}`] = val; return builder },
        in: () => builder,
        lte: () => builder,
        order: (column: string) => {
          if (table === 'theme_labels') dbMocks.labelOrder(column)
          return builder
        },
        range: async (from: number, to: number) => {
          dbMocks.labelRange(from, to)
          if (from === dbMocks.labelErrorFrom) {
            return { data: null, error: { message: 'label source unavailable' } }
          }
          return { data: dbMocks.labelRows.slice(from, to + 1), error: null }
        },
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
            return resolve({ data: dbMocks.labelRows.slice(0, 1000), error: null })
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
    dbMocks.legacyScopeCalls = 0
    dbMocks.scoredRowsByKey.clear()
    dbMocks.pendingRows = []
    dbMocks.labelRows = []
    dbMocks.labelErrorFrom = null
  })

  it('recomputes the full-day aggregate (not just this batch) when only one of three rows was newly scored', async () => {
    // This run's pending batch has just 1 row for 2026-07-06/b-abl-v1 — the other 2 rows for that
    // same (date, model) were already scored by a previous run.
    dbMocks.pendingRows = [
      { id: 'p3', theme_id: 'theme-c', prediction_date: '2026-07-06', model_version: 'b-abl-v1', labeler_version: 'gta-v1', p_rise: 0.9, abstain: false },
    ]
    dbMocks.labelRows = [
      { theme_id: 'theme-c', base_date: '2026-07-06', labeler_version: 'gta-v1', label_status: 'final', g_log_ratio: 0.3, y_binary: true },
    ]
    // Post-update DB state for the full day: 2 already-scored rows + the just-scored p3.
    dbMocks.scoredRowsByKey.set('2026-07-06|b-abl-v1', [
      { theme_id: 'theme-a', prediction_date: '2026-07-06', p_rise: 0.8, abstain: false, actual_y: true },
      { theme_id: 'theme-b', prediction_date: '2026-07-06', p_rise: 0.2, abstain: false, actual_y: false },
      { theme_id: 'theme-c', prediction_date: '2026-07-06', p_rise: 0.9, abstain: false, actual_y: true },
    ])

    const { countExpiredPendingPredictions, evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')
    const result = await evaluateThemePredictionsV3({ today: '2026-07-13' })
    await countExpiredPendingPredictions(result.cutoffDate)

    expect(result.updates).toBe(1)
    expect(dbMocks.batchUpsert).toHaveBeenCalledTimes(1)
    expect(dbMocks.legacyScopeCalls).toBe(3)
    const [, rows] = dbMocks.batchUpsert.mock.calls[0]
    expect(rows).toHaveLength(1)
    if (!rows) throw new Error('rows 없음')
    // n_scored reflects all 3 rows for the day, not just the 1 row scored in this batch.
    expect(rows[0]).toMatchObject({
      metric_date: '2026-07-06',
      model_version: 'b-abl-v1',
      n_scored: 3,
      coverage: 1,
    })
  })

  it('scores a prediction using its GT-A label beyond the first 1,000 rows', async () => {
    dbMocks.pendingRows = [
      { id: 'p1000', theme_id: 'theme-1000', prediction_date: '2026-07-06', model_version: 'b-abl-v1', labeler_version: 'gta-v1', p_rise: 0.8, abstain: false },
    ]
    dbMocks.labelRows = Array.from({ length: 1001 }, (_, index) => ({
      theme_id: `theme-${index}`, base_date: '2026-07-06', labeler_version: 'gta-v1',
      label_status: 'final', g_log_ratio: 0.3, y_binary: true,
    }))
    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')

    const result = await evaluateThemePredictionsV3({ today: '2026-07-13' })

    expect(result).toMatchObject({ updates: 1, skippedPending: 0 })
    expect(dbMocks.updateCalls).toEqual([
      expect.objectContaining({ actual_g: 0.3, actual_y: true, score_status: 'scored' }),
    ])
    expect(dbMocks.labelRange.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(dbMocks.labelOrder.mock.calls).toEqual([['id'], ['id']])
  })

  it.each([0, 1000])('keeps the GT-A label error and stops persistence when page %i fails', async (from) => {
    dbMocks.pendingRows = [
      { id: 'p1', theme_id: 'theme-a', prediction_date: '2026-07-06', model_version: 'b-abl-v1', labeler_version: 'gta-v1', p_rise: 0.8, abstain: false },
    ]
    dbMocks.labelRows = Array.from({ length: 1000 }, () => ({}))
    dbMocks.labelErrorFrom = from
    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')

    await expect(evaluateThemePredictionsV3({ today: '2026-07-13' })).rejects.toThrow(
      'GT-A 라벨 로딩 실패: label source unavailable',
    )
    expect(dbMocks.updateCalls).toEqual([])
    expect(dbMocks.batchUpsert).not.toHaveBeenCalled()
  })

  it('fails instead of converting a null scored outcome to a negative metric observation', async () => {
    dbMocks.pendingRows = [
      { id: 'p1', theme_id: 'theme-a', prediction_date: '2026-07-06', model_version: 'b-abl-v1', labeler_version: 'gta-v1', p_rise: 0.8, abstain: false },
    ]
    dbMocks.labelRows = [
      { theme_id: 'theme-a', base_date: '2026-07-06', labeler_version: 'gta-v1', label_status: 'final', g_log_ratio: 0.3, y_binary: true },
    ]
    dbMocks.scoredRowsByKey.set('2026-07-06|b-abl-v1', [
      { theme_id: 'theme-a', prediction_date: '2026-07-06', p_rise: 0.8, abstain: false, actual_y: null },
    ])
    const { evaluateThemePredictionsV3 } = await import('@/scripts/tli/comparison/theme-predictions-v3-scoring')

    await expect(evaluateThemePredictionsV3({ today: '2026-07-13' })).rejects.toThrow(/non-null actual_y/)
    expect(dbMocks.batchUpsert).not.toHaveBeenCalled()
  })
})
