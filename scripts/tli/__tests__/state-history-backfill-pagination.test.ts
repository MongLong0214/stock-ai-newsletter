import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ errorFrom: -1, order: vi.fn(), from: vi.fn(), upsert: vi.fn(), batchQuery: vi.fn() }))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@/scripts/tli/shared/supabase-batch', () => ({ batchQuery: db.batchQuery }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    db.from(table)
    const rows = Array.from({ length: 1000 }, () => ({ theme_id: 'theme-old' }))
    rows.push({ theme_id: 'theme-later' })
    const query = {
      select: () => query, eq: () => query,
      order: (column: string) => { db.order(column); return query },
      upsert: db.upsert,
      range: async (from: number, to: number) => from === db.errorFrom
        ? { data: null, error: { message: 'state history page failed' } }
        : { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null },
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'themes'
        ? [{ id: 'theme-later', is_active: true, first_spike_date: null, created_at: '2026-01-01', updated_at: '2026-10-16' }]
        : rows.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { backfillThemeStateHistory } from '@/scripts/tli/ops/run-theme-state-history-backfill'

describe('state history backfill pagination', () => {
  beforeEach(() => { vi.clearAllMocks(); db.errorFrom = -1 })

  it('recognizes existing themes beyond row 999 without backfilling them again', async () => {
    await expect(backfillThemeStateHistory()).resolves.toEqual({ insertedCount: 0 })
    expect(db.order).toHaveBeenCalledWith('id')
    expect(db.batchQuery).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('throws a later history page error before loading themes or writing', async () => {
    db.errorFrom = 1000
    await expect(backfillThemeStateHistory()).rejects.toThrow('state history page failed')
    expect(db.from).not.toHaveBeenCalledWith('themes')
    expect(db.upsert).not.toHaveBeenCalled()
  })
})
