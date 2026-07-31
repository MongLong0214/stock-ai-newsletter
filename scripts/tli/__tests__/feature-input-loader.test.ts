import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFeatureVector } from '../../../lib/tli/features/build-features'

type QueryPage = {
  readonly data: readonly unknown[] | null
  readonly error: { readonly message: string } | null
}

const supabaseAdminMocks = vi.hoisted(() => {
  const pagesByTable = new Map<string, QueryPage[]>()
  const rangeCallsByTable = new Map<string, Array<readonly [number, number]>>()
  return { pagesByTable, rangeCallsByTable }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gte: vi.fn(() => query),
        lte: vi.fn(() => query),
        or: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(async (from: number, to: number) => {
          const calls = supabaseAdminMocks.rangeCallsByTable.get(table) ?? []
          calls.push([from, to])
          supabaseAdminMocks.rangeCallsByTable.set(table, calls)
          return supabaseAdminMocks.pagesByTable.get(table)?.shift() ?? { data: [], error: null }
        }),
        then<TResult1 = QueryPage, TResult2 = never>(
          onFulfilled?: ((value: QueryPage) => TResult1 | PromiseLike<TResult1>) | null,
          onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)
        },
      }
      return query
    }),
  },
}))

import {
  assembleFeatureInputsFromRows,
  loadFeatureInputsForBaseDate,
  type FeatureInputRows,
} from '../features/load-feature-inputs'

const rows = {
  themeId: 'theme-a',
  baseDate: '2026-07-10',
  interestRows: [
    { theme_id: 'theme-a', time: '2026-07-01', raw_value: 10, anchor_scaled_value: 10 },
    { theme_id: 'theme-a', time: '2026-07-02', raw_value: 11, anchor_scaled_value: 11 },
    { theme_id: 'theme-a', time: '2026-07-03', raw_value: 12, anchor_scaled_value: 12 },
    { theme_id: 'theme-a', time: '2026-07-06', raw_value: 13, anchor_scaled_value: 13 },
    { theme_id: 'theme-a', time: '2026-07-07', raw_value: 14, anchor_scaled_value: 14 },
    { theme_id: 'theme-a', time: '2026-07-08', raw_value: 15, anchor_scaled_value: 15 },
    { theme_id: 'theme-a', time: '2026-07-09', raw_value: 16, anchor_scaled_value: 16 },
    { theme_id: 'theme-a', time: '2026-07-10', raw_value: 17, anchor_scaled_value: 17 },
    { theme_id: 'theme-a', time: '2026-07-13', raw_value: 99, anchor_scaled_value: 99 },
    { theme_id: 'theme-b', time: '2026-07-10', raw_value: 20, anchor_scaled_value: 20 },
    { theme_id: 'theme-c', time: '2026-07-10', raw_value: 30, anchor_scaled_value: 30 },
  ],
  newsRows: [
    { theme_id: 'theme-a', time: '2026-07-08', article_count: 3 },
    { theme_id: 'theme-a', time: '2026-07-10', article_count: 5 },
    { theme_id: 'theme-a', time: '2026-07-13', article_count: 50 },
  ],
  themeStockRows: [
    { theme_id: 'theme-a', symbol: '005930', relevance: 0.9, is_active: true },
    { theme_id: 'theme-a', symbol: '000660', relevance: 0.8, is_active: true },
    { theme_id: 'theme-a', symbol: '035420', relevance: 0.7, is_active: false },
  ],
  priceRows: [
    { symbol: '005930', trade_date: '2026-07-03', close: 100, volume: 100 },
    { symbol: '005930', trade_date: '2026-07-10', close: 110, volume: 150 },
    { symbol: '005930', trade_date: '2026-07-13', close: 200, volume: 999 },
    { symbol: '000660', trade_date: '2026-07-03', close: 200, volume: 200 },
    { symbol: '000660', trade_date: '2026-07-10', close: 220, volume: 240 },
    { symbol: 'KOSPI', trade_date: '2026-07-03', close: 1000, volume: null },
    { symbol: 'KOSPI', trade_date: '2026-07-10', close: 1010, volume: null },
  ],
  themeStateRows: [
    { theme_id: 'theme-a', effective_from: '2026-07-01', is_active: true, first_spike_date: '2026-07-01' },
    { theme_id: 'theme-a', effective_from: '2026-07-13', is_active: true, first_spike_date: '2026-07-01' },
  ],
  completedEpisodeRows: [
    { episode_start: '2026-06-01', episode_end: '2026-06-16', primary_peak_date: '2026-06-11', is_active: false },
    { episode_start: '2026-06-01', episode_end: '2026-06-20', primary_peak_date: '2026-06-15', is_active: false },
    { episode_start: '2026-06-01', episode_end: '2026-06-05', primary_peak_date: null, is_active: false },
  ],
  snapshotRows: [
    { theme_id: 'theme-a', snapshot_date: '2026-07-09', phase: 'cooling' },
    { theme_id: 'theme-a', snapshot_date: '2026-07-10', phase: 'rising' },
    { theme_id: 'theme-b', snapshot_date: '2026-07-10', phase: 'cooling' },
  ],
} satisfies FeatureInputRows

beforeEach(() => {
  supabaseAdminMocks.pagesByTable.clear()
  supabaseAdminMocks.rangeCallsByTable.clear()
})

describe('T-201 feature input loader assembly', () => {
  it('ignores rows after the base date for point-in-time safety', () => {
    const assembled = assembleFeatureInputsFromRows(rows)

    expect(assembled.interestRaw).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
    expect(assembled.anchorScaled).toEqual([11, 12, 13, 14, 15, 16, 17])
    expect(assembled.crossSectionalAnchorMeans).toEqual([14, 20, 30])
    expect(assembled.newsCounts.reduce((sum, value) => sum + value, 0)).toBe(8)
    expect(assembled.basketStocks.map((stock) => stock.symbol)).toEqual(['000660', '005930'])
    expect(assembled.basketStocks.find((stock) => stock.symbol === '005930')?.closeAtBase).toBe(110)
    expect(assembled.kospiCloseAtBase).toBe(1010)
    expect(assembled.daysSinceSpike).toBe(7)
    expect(assembled.bablPhaseSignal).toBe(1)
    // Both completed-before-baseDate episodes with a primary_peak_date contribute; the null-peak row never does.
    expect(assembled.completedEpisodePeakDays).toHaveLength(2)
  })

  it('requires an exact theme/date snapshot match for the B-abl phase signal', () => {
    const assembled = assembleFeatureInputsFromRows({
      ...rows,
      snapshotRows: [
        { theme_id: 'theme-a', snapshot_date: '2026-07-09', phase: 'rising' },
        { theme_id: 'theme-b', snapshot_date: '2026-07-10', phase: 'cooling' },
      ],
    })

    expect(assembled.bablPhaseSignal).toBeNull()
  })

  it('maps B-abl snapshot phases to rising=1, cooling=-1, other=0', () => {
    expect(assembleFeatureInputsFromRows({
      ...rows,
      snapshotRows: [{ theme_id: 'theme-a', snapshot_date: '2026-07-10', phase: 'cooling' }],
    }).bablPhaseSignal).toBe(-1)
    expect(assembleFeatureInputsFromRows({
      ...rows,
      snapshotRows: [{ theme_id: 'theme-a', snapshot_date: '2026-07-10', phase: 'hot' }],
    }).bablPhaseSignal).toBe(0)
  })

  it('excludes completed-episode cohort members that finish after baseDate (B1 — no future leakage)', () => {
    const rowsWithFutureCompletion: FeatureInputRows = {
      ...rows,
      completedEpisodeRows: [
        ...rows.completedEpisodeRows,
        // Completes the day after baseDate — must not leak into the baseDate=2026-07-10 cohort.
        { episode_start: '2026-07-01', episode_end: '2026-07-11', primary_peak_date: '2026-07-05', is_active: false },
        // No episode_end recorded — cannot confirm completion, so it must be excluded defensively.
        { episode_start: '2026-05-01', episode_end: null, primary_peak_date: '2026-05-20', is_active: false },
      ],
    }

    const assembled = assembleFeatureInputsFromRows(rowsWithFutureCompletion)

    expect(assembled.completedEpisodePeakDays).toHaveLength(2)
  })

  it('filters basket stocks to theme mappings created by baseDate', () => {
    const rowsWithPointInTimeBasket: FeatureInputRows = {
      ...rows,
      themeStockRows: [
        { theme_id: 'theme-a', symbol: '999999', relevance: 1, is_active: true, created_at: '2026-07-10T15:00:00.000Z' },
        { theme_id: 'theme-a', symbol: '005930', relevance: 0.9, is_active: true, created_at: '2026-07-10T14:59:59.000Z' },
        { theme_id: 'theme-a', symbol: '000660', relevance: 0.8, is_active: true, created_at: null },
        { theme_id: 'theme-b', symbol: '111111', relevance: 1, is_active: true, created_at: '2026-07-01T00:00:00.000Z' },
      ],
      priceRows: [
        ...rows.priceRows,
        { symbol: '999999', trade_date: '2026-07-03', close: 1000, volume: 10_000 },
        { symbol: '999999', trade_date: '2026-07-10', close: 2000, volume: 20_000 },
        { symbol: '111111', trade_date: '2026-07-03', close: 1000, volume: 10_000 },
        { symbol: '111111', trade_date: '2026-07-10', close: 2000, volume: 20_000 },
      ],
    }

    const assembled = assembleFeatureInputsFromRows(rowsWithPointInTimeBasket)
    const vector = buildFeatureVector(assembled)

    expect(assembled.basketStocks.map((stock) => stock.symbol)).toEqual(['000660', '005930'])
    expect(vector.values[6]).toBeCloseTo(0.09)
    expect(vector.values[7]).toBeCloseTo(1)
  })
})

describe('T-201 feature input loader pagination', () => {
  it('fetches a second page when a feature-source query returns exactly 1000 rows', async () => {
    const exactPage = Array.from({ length: 1000 }, (_, index) => ({
      theme_id: `theme-${index}`,
      time: '2026-07-10',
      raw_value: index,
      anchor_scaled_value: index,
    }))
    supabaseAdminMocks.pagesByTable.set('interest_metrics', [
      { data: exactPage, error: null },
      { data: [], error: null },
    ])

    await loadFeatureInputsForBaseDate({ themeId: 'theme-a', baseDate: '2026-07-10' })

    expect(supabaseAdminMocks.rangeCallsByTable.get('interest_metrics')).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('loads prediction snapshot rows through the same paginated path', async () => {
    supabaseAdminMocks.pagesByTable.set('prediction_snapshots_v2', [
      {
        data: [{ theme_id: 'theme-a', snapshot_date: '2026-07-10', phase: 'cooling' }],
        error: null,
      },
    ])

    const assembled = await loadFeatureInputsForBaseDate({ themeId: 'theme-a', baseDate: '2026-07-10' })

    expect(assembled.bablPhaseSignal).toBe(-1)
    expect(supabaseAdminMocks.rangeCallsByTable.get('prediction_snapshots_v2')).toEqual([[0, 999]])
  })

})
