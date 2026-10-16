import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  snapshots: [] as Record<string, unknown>[], errorFrom: -1, order: vi.fn(), range: vi.fn(), batchQuery: vi.fn(),
}))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => {
    const query = {
      select: () => query, gte: () => query, lte: () => query,
      order: (column: string, options?: unknown) => { db.order(column, options); return query },
      range: async (from: number, to: number) => {
        db.range(from, to)
        return from === db.errorFrom ? { data: null, error: { message: 'snapshot page failed' } }
          : { data: db.snapshots.slice(from, Math.min(to + 1, from + 1000)), error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: db.snapshots.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
vi.mock('@/scripts/tli/shared/supabase-batch', () => ({ batchQuery: db.batchQuery }))
import { loadPredictionParityReport } from '@/scripts/tli/comparison/prediction-parity-loader'

const input = { asOfDate: '2026-10-16', windowDays: 14 }
describe('prediction parity snapshot pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.snapshots = Array.from({ length: 1005 }, (_, i) => ({
      id: `snapshot-${i}`, theme_id: 'theme', snapshot_date: '2026-10-16', comparison_run_id: 'run',
      phase: 'rising', confidence: 'medium', risk_level: 'low', avg_peak_day: 30, avg_total_days: 60,
      avg_days_to_peak: 8, days_since_spike: 22, created_at: '2026-10-16T00:00:00Z',
    }))
    db.batchQuery.mockResolvedValue([])
  })

  it('includes snapshots past 999 in the report and uniquely orders associated batches', async () => {
    const report = await loadPredictionParityReport(input)
    expect(report.snapshotCount).toBe(1005)
    expect(report.mismatches.at(-1)).toMatchObject({ snapshotId: 'snapshot-1004', fields: ['score_missing'] })
    expect(db.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(db.order).toHaveBeenCalledWith('snapshot_date', { ascending: false })
    expect(db.order).toHaveBeenCalledWith('id', undefined)
    expect(db.batchQuery).toHaveBeenCalledTimes(3)
    for (const call of db.batchQuery.mock.calls) {
      expect(call[5]).toEqual({ failOnError: true, orderBy: { column: 'id' } })
    }
  })

  it('throws a later snapshot page error before loading associated data', async () => {
    db.errorFrom = 1000
    await expect(loadPredictionParityReport(input)).rejects.toThrow('prediction parity snapshot load failed: snapshot page failed')
    expect(db.batchQuery).not.toHaveBeenCalled()
  })
})
