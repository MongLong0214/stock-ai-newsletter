import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[], errorFrom: -1, order: vi.fn(), range: vi.fn(),
}))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => {
    const query = {
      select: () => query, eq: () => query, not: () => query, gte: () => query, lte: () => query, in: () => query,
      order: (column: string) => { db.order(column); return query },
      range: async (from: number, to: number) => {
        db.range(from, to)
        return from === db.errorFrom ? { data: null, error: { message: 'history page failed' } }
          : { data: db.rows.slice(from, Math.min(to + 1, from + 1000)), error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: db.rows.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { loadInferredPrimaryRows } from '@/scripts/tli/ops/run-anchor-stability-report'
import { inferPrimaryAnchorObservationsFromInterestRows } from '@/scripts/tli/ops/anchor-stability-report'
import { loadFirstSpikeHistoryRows } from '@/scripts/tli/ops/run-first-spike-repair'
import { loadShadowPredictions } from '@/scripts/tli/ops/run-shadow-transition-report'

describe('ops history pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.rows = Array.from({ length: 1003 }, (_, i) => ({
      theme_id: `theme-${i}`, first_spike_date: '2026-02-06', time: '2026-10-16', raw_value: 100 + i, anchor_scaled_value: 2,
    }))
  })

  it('uses anchor-scale observations beyond row 999', async () => {
    const rows = await loadInferredPrimaryRows('2026-10-03', '2026-10-16')
    const observations = inferPrimaryAnchorObservationsFromInterestRows(rows)
    expect(observations).toHaveLength(1003)
    expect(observations.at(-1)?.value).toBe(551)
    expect(db.order).toHaveBeenCalledWith('id')
  })

  it('throws a later anchor observation page error', async () => {
    db.errorFrom = 1000
    await expect(loadInferredPrimaryRows('2026-10-03', '2026-10-16')).rejects.toThrow('history page failed')
  })

  it('recovers first-spike history themes beyond row 999', async () => {
    const rows = await loadFirstSpikeHistoryRows(['2026-02-06'])
    expect(rows).toHaveLength(1003)
    expect(rows.at(-1)?.theme_id).toBe('theme-1002')
    expect(db.order).toHaveBeenCalledWith('id')
  })

  it('throws a later first-spike history page error', async () => {
    db.errorFrom = 1000
    await expect(loadFirstSpikeHistoryRows(['2026-02-06'])).rejects.toThrow('history page failed')
  })

  it('loads shadow transition observations beyond row 999', async () => {
    db.rows = Array.from({ length: 1003 }, (_, i) => ({
      prediction_date: '2026-10-16', model_version: `model-${i}`, serving_role: 'shadow',
    }))
    const result = await loadShadowPredictions('2026-10-16')
    expect(result).toHaveLength(1003)
    expect(result.at(-1)?.modelVersion).toBe('model-1002')
    expect(db.order).toHaveBeenCalledWith('id')
  })

  it('throws a later shadow transition page error', async () => {
    db.errorFrom = 1000
    await expect(loadShadowPredictions('2026-10-16')).rejects.toThrow('history page failed')
  })
})
