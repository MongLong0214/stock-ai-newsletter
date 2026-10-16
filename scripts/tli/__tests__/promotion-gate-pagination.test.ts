import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], errorFrom: -1, build: vi.fn(), order: vi.fn() }))
vi.mock('@/scripts/tli/learn/gate-input-metrics', () => ({
  buildPromotionGateInputFromRows: db.build, countPromotionsThisYear: vi.fn(), estimateCycleExtendedWeeks: vi.fn(),
}))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    const query = {
      select: () => query, eq: () => query,
      order: (column: string) => { db.order(column); return query },
      range: async (from: number, to: number) => from === db.errorFrom
        ? { data: null, error: { message: 'gate page failed' } }
        : { data: db.rows.slice(from, Math.min(to + 1, from + 1000)), error: null },
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'model_registry'
        ? [{ model_version: 'champion', status: 'champion', promoted_at: null }, { model_version: 'challenger', status: 'challenger', promoted_at: null }]
        : db.rows.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { buildPromotionGateInputFromDb } from '@/scripts/tli/learn/gate-input-from-db'

describe('promotion gate score history pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.rows = Array.from({ length: 1003 }, (_, i) => ({
      theme_id: `theme-${i}`, prediction_date: '2026-10-16', p_rise: 0.7, abstain: false, actual_y: true,
    }))
  })

  it('passes full champion and challenger histories, including rows after 999, to the gate', async () => {
    await buildPromotionGateInputFromDb({ asOfDate: '2026-10-16' })
    expect(db.build).toHaveBeenCalledWith(expect.objectContaining({ championScored: db.rows, challengerScored: db.rows }))
    expect(db.order).toHaveBeenCalledWith('id')
  })

  it('throws a later score page error before building a gate from partial data', async () => {
    db.errorFrom = 1000
    await expect(buildPromotionGateInputFromDb({ asOfDate: '2026-10-16' })).rejects.toThrow('gate page failed')
    expect(db.build).not.toHaveBeenCalled()
  })
})
