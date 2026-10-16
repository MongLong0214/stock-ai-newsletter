import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttentionStudyContract } from '@/scripts/tli/collectors/babl-phase-snapshot'

const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], errorFrom: -1, order: vi.fn(), eq: vi.fn(), in: vi.fn() }))
vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: () => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { db.eq(column, value); return query },
      in: (column: string, value: unknown) => { db.in(column, value); return query },
      order: (column: string) => { db.order(column); return query },
      range: async (from: number, to: number) => from === db.errorFrom
        ? { data: null, error: { message: 'B-Abl page failed' } }
        : { data: db.rows.slice(from, Math.min(to + 1, from + 1000)), error: null },
      then: (resolve: (value: unknown) => void) => resolve({ data: db.rows.slice(0, 1000), error: null }),
    }
    return query
  } },
}))
import { loadStudyBablCandidates } from '@/scripts/tli/origins/origin-sources'

const themeId = '00000000-0000-4000-8000-000000000001'
const input = {
  originDate: '2026-10-12', themeIds: [themeId],
  study: { babl_algorithm_version: 'algorithm', babl_comparison_spec_version: 'spec', babl_evaluation_horizon_days: 14 } as AttentionStudyContract,
}

describe('study B-Abl source pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.rows = Array.from({ length: 1003 }, (_, i) => ({
      id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`, theme_id: themeId,
      payload_hash: `hash-${i}`, candidate_pool: 'archetype', computed_at: '2026-10-12T00:00:00Z',
      run: { status: 'complete', collected_at: '2026-10-12T00:00:00Z', completed_at: '2026-10-12T00:00:00Z' },
      snapshot: { candidate_pool: 'archetype', created_at: '2026-10-12T00:00:00Z', run_type: 'prod',
        comparison_run: { status: 'published', candidate_pool: 'archetype' } },
    }))
  })

  it('keeps repeated-run observations beyond row 999 for ambiguity detection', async () => {
    const result = await loadStudyBablCandidates(input)
    expect(result.get(themeId)).toHaveLength(1003)
    expect(result.get(themeId)?.at(-1)?.payloadHash).toBe('hash-1002')
    expect(db.order).toHaveBeenCalledWith('id')
    expect(db.eq).toHaveBeenCalledWith('snapshot_date', input.originDate)
    expect(db.eq).toHaveBeenCalledWith('snapshot.run_type', 'prod')
    expect(db.in).toHaveBeenCalledWith('theme_id', [themeId])
  })

  it('throws a later B-Abl page error', async () => {
    db.errorFrom = 1000
    await expect(loadStudyBablCandidates(input)).rejects.toThrow('B-Abl page failed')
  })
})
