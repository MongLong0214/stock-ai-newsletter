import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; current_theme_id: string; candidate_pool: string; created_at: string }>,
  errorFrom: -1, order: vi.fn(), eq: vi.fn(), in: vi.fn(),
}))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => {
    const orders: Array<{ column: keyof typeof db.rows[number]; ascending: boolean }> = []
    const orderedRows = () => [...db.rows].sort((left, right) => {
      for (const { column, ascending } of orders) {
        if (left[column] < right[column]) return ascending ? -1 : 1
        if (left[column] > right[column]) return ascending ? 1 : -1
      }
      return 0
    })
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { db.eq(column, value); return query },
      in: (column: string, value: unknown) => { db.in(column, value); return query },
      order: (column: keyof typeof db.rows[number], options?: { ascending: boolean }) => {
        db.order(column, options)
        orders.push({ column, ascending: options?.ascending ?? true })
        return query
      },
      range: async (from: number, to: number) => from === db.errorFrom
        ? { data: null, error: { message: 'run page failed' } }
        : { data: orderedRows().slice(from, Math.min(to + 1, from + 1000)), error: null },
      then: (resolve: (value: unknown) => void) => resolve({ data: orderedRows().slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { getComparisonV4ShadowConfig, loadShadowRunsByTheme } from '@/scripts/tli/comparison/v4/shadow'

const input = () => ({
  config: { ...getComparisonV4ShadowConfig(), enabled: true },
  themeIds: ['theme-0', 'theme-1'], runDate: '2026-10-16',
})

describe('shadow run pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.rows = Array.from({ length: 1000 }, (_, i) => ({
      id: `run-${i}`, current_theme_id: 'theme-0', candidate_pool: 'archetype', created_at: '2026-10-16',
    }))
    db.rows.push({ id: 'run-last', current_theme_id: 'theme-1', candidate_pool: 'peer', created_at: '2026-10-15' })
  })

  it('loads later themes and preserves the first run per theme', async () => {
    const result = await loadShadowRunsByTheme(input())
    expect(result.get('theme-0')?.runId).toBe('run-0')
    expect(result.get('theme-1')?.runId).toBe('run-last')
    expect(db.order.mock.calls.slice(0, 2)).toEqual([['created_at', { ascending: false }], ['id', undefined]])
    expect(db.eq).toHaveBeenCalledWith('run_date', '2026-10-16')
    expect(db.in).toHaveBeenCalledWith('run_type', ['prod', 'shadow'])
    expect(db.in).toHaveBeenCalledWith('status', ['materializing', 'complete', 'published'])
  })

  it('throws a later run page error', async () => {
    db.errorFrom = 1000
    await expect(loadShadowRunsByTheme(input())).rejects.toThrow('run page failed')
  })

  it('selects the latest run and breaks created_at ties by ascending id', async () => {
    db.rows = [
      { id: 'run-0', current_theme_id: 'theme-0', candidate_pool: 'peer', created_at: '2026-10-14' },
      { id: 'run-z', current_theme_id: 'theme-0', candidate_pool: 'peer', created_at: '2026-10-16' },
      { id: 'run-a', current_theme_id: 'theme-0', candidate_pool: 'archetype', created_at: '2026-10-16' },
    ]
    const result = await loadShadowRunsByTheme(input())
    expect(result.get('theme-0')).toMatchObject({ runId: 'run-a', candidatePool: 'archetype' })
  })
})
