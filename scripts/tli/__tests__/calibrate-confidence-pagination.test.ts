import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  scores: [] as Record<string, unknown>[], snapshots: [] as Record<string, unknown>[],
  errorFrom: -1, snapshotError: false, order: vi.fn(), range: vi.fn(), in: vi.fn(),
  calibrate: vi.fn(), upsert: vi.fn(),
}))
vi.mock('dotenv', () => ({ config: vi.fn() }))
vi.mock('@/lib/tli/confidence-calibration', () => ({ calibrateConfidenceThresholds: db.calibrate }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, not: () => query, limit: () => query,
      in: (column: string, ids: string[]) => { db.in(column, ids); return query },
      order: (column: string) => { db.order(table, column); return query },
      upsert: db.upsert,
      range: async (from: number, to: number) => {
        db.range(from, to)
        return from === db.errorFrom ? { data: null, error: new Error('confidence page failed') }
          : { data: db.scores.slice(from, Math.min(to + 1, from + 1000)), error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve({
        data: table === 'prediction_snapshots_v2' ? db.snapshots : db.scores.slice(0, 1000),
        error: db.snapshotError ? new Error('snapshots failed') : null,
      }),
    }
    return query
  } },
}))
import { calibrateConfidence } from '@/scripts/tli/scoring/calibrate-confidence'

describe('confidence score pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.snapshotError = false
    db.calibrate.mockReturnValue({ highCoverage: 80, highDays: 20, mediumCoverage: 50, mediumDays: 10, ece: 0.1 })
    db.upsert.mockResolvedValue({ error: null })
    db.snapshots = Array.from({ length: 40 }, (_, i) => ({
      theme_id: `theme-${i}`, snapshot_date: `date-${i}`, phase_correct: i % 2 === 0, status: 'evaluated',
    }))
    // The lookup is a themes x dates product; these rows are not snapshot pairs.
    db.scores = Array.from({ length: 1000 }, (_, i) => ({
      theme_id: `theme-${i % 40}`, calculated_at: `date-${(i % 40 + 1) % 40}`, components: null,
    }))
    db.scores.push(...db.snapshots.map(row => ({
      theme_id: row.theme_id, calculated_at: row.snapshot_date,
      components: { confidence: { interestCoverage: 80, newsCoverage: 60, dataAge: 25 } },
    })))
  })

  it('builds samples from matching scores beyond row 999 despite a 500-snapshot cap', async () => {
    expect(await calibrateConfidence()).toMatchObject({ ece: 0.1 })
    expect(db.calibrate).toHaveBeenCalledWith(Array.from({ length: 40 }, (_, i) => ({
      coverageScore: 72, interestDays: 25, accurate: i % 2 === 0,
    })))
    expect(db.range.mock.calls).toEqual([[0, 999], [1000, 1999]])
    expect(db.order).toHaveBeenCalledWith('lifecycle_scores', 'id')
    expect(db.in).toHaveBeenCalledWith('calculated_at', db.snapshots.map(row => row.snapshot_date))
  })

  it('throws a later score page error without calibrating partial data', async () => {
    db.errorFrom = 1000
    await expect(calibrateConfidence()).rejects.toThrow('confidence page failed')
    expect(db.calibrate).not.toHaveBeenCalled()
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('propagates snapshot query errors', async () => {
    db.snapshotError = true
    await expect(calibrateConfidence()).rejects.toThrow('snapshots failed')
  })
})
