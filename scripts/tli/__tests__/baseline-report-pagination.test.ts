import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>[]>(), errorTable: '', order: vi.fn(), range: vi.fn(), filter: vi.fn(), select: vi.fn(),
}))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    const orders: Array<{ column: string; ascending: boolean }> = []
    const orderedRows = () => [...(db.rows.get(table) ?? [])].sort((left, right) => {
      for (const { column, ascending } of orders) {
        const a = left[column] as string | number
        const b = right[column] as string | number
        if (a < b) return ascending ? -1 : 1
        if (a > b) return ascending ? 1 : -1
      }
      return 0
    })
    const query = {
      select: (columns: string) => { db.select(table, columns); return query },
      eq: (column: string, value: unknown) => { db.filter(table, 'eq', column, value); return query },
      in: (column: string, value: unknown) => { db.filter(table, 'in', column, value); return query },
      gte: (column: string, value: unknown) => { db.filter(table, 'gte', column, value); return query },
      lte: (column: string, value: unknown) => { db.filter(table, 'lte', column, value); return query },
      order: (column: string, options?: { ascending: boolean }) => {
        db.order(table, column, options)
        orders.push({ column, ascending: options?.ascending ?? true })
        return query
      },
      range: async (from: number, to: number) => {
        db.range(table, from, to)
        return table === db.errorTable && from === 1000 ? { data: null, error: new Error(`${table} page failed`) }
          : { data: orderedRows().slice(from, Math.min(to + 1, from + 1000)), error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: orderedRows().slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { loadFeatureSourceRows, loadLabels, loadSnapshots } from '@/scripts/tli/ops/run-baseline-report'
import { assembleFeatureInputsFromRows } from '@/scripts/tli/features/load-feature-inputs'

const start = '2026-10-01'
const end = '2026-10-16'
const labels = [{ themeId: 'theme', baseDate: end, y: true }]
const sources = [
  ['interest_metrics', 'interestRows'], ['news_metrics', 'newsRows'], ['theme_stocks', 'themeStockRows'],
  ['stock_daily_prices', 'priceRows'], ['theme_state_history_v2', 'themeStateRows'], ['episode_registry_v1', 'completedEpisodeRows'],
] as const

describe('baseline report pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.rows.clear()
    db.errorTable = ''
    for (const table of ['theme_labels', 'prediction_snapshots_v2', ...sources.map(([table]) => table)]) {
      db.rows.set(table, Array.from({ length: 1002 }, (_, i) => ({
        id: i,
        theme_id: `theme-${i}`, base_date: end, y_binary: i === 1001 ? null : true,
        snapshot_date: end, phase: i === 1001 ? 'hot' : 'rising', symbol: `symbol-${String(i).padStart(4, '0')}`,
        time: end, raw_value: i, anchor_scaled_value: i, article_count: i,
        relevance: 1, is_active: false, trade_date: end, close: i, volume: i,
        effective_from: end, first_spike_date: end, episode_start: end, episode_end: end, primary_peak_date: end,
      })))
    }
  })

  it('reads labels after row 999 and preserves null-label exclusion', async () => {
    const result = await loadLabels(start, end)
    expect(result).toHaveLength(1001)
    expect(result.at(-1)).toEqual({ themeId: 'theme-1000', baseDate: end, y: true })
    expect(db.order).toHaveBeenCalledWith('theme_labels', 'id', undefined)
    expect(db.filter).toHaveBeenCalledWith('theme_labels', 'eq', 'label_status', 'final')
  })

  it('throws on a later label page', async () => {
    db.errorTable = 'theme_labels'
    await expect(loadLabels(start, end)).rejects.toThrow('GT-A final 라벨 로딩 실패: theme_labels page failed')
  })

  it('maps snapshots after row 999', async () => {
    const result = await loadSnapshots(start, end)
    expect(result).toHaveLength(1002)
    expect(result.at(-1)).toEqual({ themeId: 'theme-1001', snapshotDate: end, phase: 'hot' })
    expect(db.order).toHaveBeenCalledWith('prediction_snapshots_v2', 'id', undefined)
    expect(db.filter).toHaveBeenCalledWith('prediction_snapshots_v2', 'eq', 'run_type', 'prod')
  })

  it('throws on a later snapshot page', async () => {
    db.errorTable = 'prediction_snapshots_v2'
    await expect(loadSnapshots(start, end)).rejects.toThrow('prediction_snapshots_v2 로딩 실패')
  })

  it.each(sources)('loads all %s feature rows past 999', async (table, key) => {
    const result = await loadFeatureSourceRows(labels)
    expect(result[key]).toHaveLength(1002)
    expect(result[key].at(-1)).toEqual(db.rows.get(table)?.at(-1))
    expect(db.range).toHaveBeenCalledWith(table, 1000, 1999)
    if (table === 'stock_daily_prices') {
      expect(db.order.mock.calls.filter(([name]) => name === table).map(([, column]) => column))
        .toEqual(['symbol', 'trade_date', 'symbol', 'trade_date'])
    } else if (table === 'interest_metrics') {
      expect(db.order.mock.calls.filter(([name]) => name === table).map(([, column, options]) => [column, options]))
        .toEqual([
          ['time', { ascending: true }], ['id', { ascending: true }],
          ['time', { ascending: true }], ['id', { ascending: true }],
        ])
    } else {
      expect(db.order).toHaveBeenCalledWith(table, 'id', undefined)
    }
    expect(db.filter).toHaveBeenCalledWith('theme_stocks', 'eq', 'is_active', true)
    expect(db.filter).toHaveBeenCalledWith('episode_registry_v1', 'eq', 'is_active', false)
    expect(db.filter).toHaveBeenCalledWith('news_metrics', 'in', 'theme_id', ['theme'])
  })

  it('uses the latest seven chronological interest values when ids run backwards', async () => {
    db.rows.clear()
    db.rows.set('interest_metrics', Array.from({ length: 9 }, (_, i) => ({
      id: 9 - i, theme_id: 'theme', time: `2026-10-${String(i + 1).padStart(2, '0')}`,
      raw_value: i + 1, anchor_scaled_value: i + 1,
    })).reverse())
    const rows = await loadFeatureSourceRows(labels)
    expect(rows.interestRows.map(row => row.anchor_scaled_value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const input = assembleFeatureInputsFromRows({ themeId: 'theme', baseDate: end, ...rows, snapshotRows: [] })
    expect(input.crossSectionalAnchorMeans).toEqual([6])
  })

  it.each(sources)('throws on a later %s feature page', async (table) => {
    db.errorTable = table
    await expect(loadFeatureSourceRows(labels)).rejects.toThrow(`${table} page failed`)
  })
})
