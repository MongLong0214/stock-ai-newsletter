import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInBatches } from '@/scripts/tli/research/optimizer/dump-data'

describe('optimizer historical metric pagination', () => {
  let rows: Array<{ theme_id: string; value: number }>
  const range = vi.fn()
  const order = vi.fn()
  const select = vi.fn()
  const inFilter = vi.fn()
  const gte = vi.fn()
  let errorFrom = -1
  const query = {
    select: (columns: string) => { select(columns); return query },
    in: (column: string, ids: string[]) => { inFilter(column, ids); return query },
    gte: (column: string, date: string) => { gte(column, date); return query },
    order: (column: string) => { order(column); return query },
    range: async (from: number, to: number) => {
      range(from, to)
      return from === errorFrom
        ? { data: null, error: { message: 'metric page failed' } }
        : { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }
    },
  }
  const client = { from: () => query } as unknown as Parameters<typeof fetchInBatches>[0]
  const tables = ['interest_metrics', 'news_metrics', 'lifecycle_scores']

  beforeEach(() => {
    vi.clearAllMocks()
    errorFrom = -1
    rows = Array.from({ length: 1003 }, (_, i) => ({ theme_id: 'theme-1', value: i }))
  })

  it('stops locally at 50000 rows when 50001 match a query batch', async () => {
    rows = Array.from({ length: 50001 }, (_, i) => ({ theme_id: 'theme-1', value: i }))
    const result = await fetchInBatches<{ value: number }>(client, 'interest_metrics', 'theme_id, value', ['theme-1'], 'theme_id', 'time', '2026-07-18')
    expect(result).toHaveLength(50000)
    expect(result.at(-1)?.value).toBe(49999)
    expect(range).toHaveBeenCalledTimes(50)
    expect(range).toHaveBeenLastCalledWith(49000, 49999)
  })

  it.each(tables)('loads %s rows beyond index 999', async (table) => {
    const result = await fetchInBatches<{ value: number }>(client, table, 'theme_id, value', ['theme-1'], 'theme_id', 'time', '2026-07-18')
    expect(result).toHaveLength(1003)
    expect(result.at(-1)?.value).toBe(1002)
    expect(order).toHaveBeenCalledWith('id')
    expect(select).toHaveBeenCalledWith('theme_id, value')
    expect(inFilter).toHaveBeenCalledWith('theme_id', ['theme-1'])
    expect(gte).toHaveBeenCalledWith('time', '2026-07-18')
  })

  it.each(tables)('throws a later %s page error', async (table) => {
    errorFrom = 1000
    await expect(fetchInBatches(client, table, 'theme_id, value', ['theme-1'], 'theme_id', 'time', '2026-07-18'))
      .rejects.toThrow('metric page failed')
  })
})
