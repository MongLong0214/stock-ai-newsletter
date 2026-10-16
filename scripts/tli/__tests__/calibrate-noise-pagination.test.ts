import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  scores: [] as Record<string, unknown>[], errorFrom: -1, themeError: false,
  order: vi.fn(), range: vi.fn(), in: vi.fn(), gte: vi.fn(), upsert: vi.fn(),
}))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    const query = {
      select: () => query, eq: () => query,
      in: (column: string, ids: string[]) => { db.in(column, ids); return query },
      gte: (column: string, date: string) => { db.gte(column, date); return query },
      order: (column: string, options?: unknown) => { db.order(column, options); return query },
      upsert: db.upsert,
      range: async (from: number, to: number) => {
        db.range(from, to)
        return from === db.errorFrom ? { data: null, error: new Error('noise page failed') }
          : { data: db.scores.slice(from, Math.min(to + 1, from + 1000)), error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve(table === 'themes'
        ? { data: Array.from({ length: 20 }, (_, i) => ({ id: `theme-${i}` })), error: db.themeError ? new Error('themes failed') : null }
        : { data: db.scores.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { calibrateNoiseThreshold } from '@/scripts/tli/scoring/calibrate-noise'

describe('noise calibration pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.themeError = false
    db.upsert.mockResolvedValue({ error: null })
    db.scores = Array.from({ length: 1000 }, (_, i) => ({
      theme_id: `theme-${i % 20}`, stage: 'Dormant',
      components: { raw: { raw_interest_avg: i % 20 < 10 ? 8 : 2 } },
    }))
    // Only the second page establishes which themes ever reached Growth.
    db.scores.push(...Array.from({ length: 10 }, (_, i) => ({
      theme_id: `theme-${i}`, stage: 'Growth', components: { raw: { raw_interest_avg: 100 } },
    })))
  })

  it('uses historical stages after row 999 while preserving the first rawAvg per theme', async () => {
    expect(await calibrateNoiseThreshold()).toMatchObject({ threshold: 2.5, auc: 1, youdenJ: 1 })
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ sample_size: 20 }), expect.anything())
    expect(db.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(db.order).toHaveBeenCalledWith('calculated_at', { ascending: false })
    expect(db.order).toHaveBeenCalledWith('id', undefined)
    expect(db.in).toHaveBeenCalledWith('theme_id', Array.from({ length: 20 }, (_, i) => `theme-${i}`))
    expect(db.gte).toHaveBeenCalledWith('calculated_at', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('throws later page errors without saving a calibration from partial scores', async () => {
    db.errorFrom = 1000
    await expect(calibrateNoiseThreshold()).rejects.toThrow('noise page failed')
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('propagates theme query errors', async () => {
    db.themeError = true
    await expect(calibrateNoiseThreshold()).rejects.toThrow('themes failed')
  })
})
