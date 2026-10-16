import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  evals: [] as Record<string, unknown>[],
  candidates: [] as Record<string, unknown>[],
  errorFrom: -1,
  candidateErrorFrom: -1,
  range: vi.fn(),
  candidateRange: vi.fn(),
  order: vi.fn(),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: (table: string) => {
    let limit = Infinity
    const rows = () => table === 'theme_comparison_candidates_v2' ? db.candidates : db.evals
    const query = {
      select: () => query,
      gte: () => query,
      is: () => query,
      in: () => query,
      limit: (count: number) => { limit = count; return query },
      order: (column: string, options?: unknown) => { db.order(column, options); return query },
      range: async (from: number, to: number) => {
        const candidate = table === 'theme_comparison_candidates_v2'
        const recordRange = candidate ? db.candidateRange : db.range
        recordRange(from, to)
        return from === (candidate ? db.candidateErrorFrom : db.errorFrom)
          ? { data: null, error: new Error(candidate ? 'candidate page failed' : 'eval page failed') }
          : { data: rows().slice(from, Math.min(to + 1, from + 1000, limit)), count: rows().length, error: null }
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: rows().slice(0, Math.min(1000, limit)), count: rows().length, error: null }),
    }
    return query
  } },
}))
vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return { ...actual, batchQuery: vi.fn(actual.batchQuery) }
})

import { computeOptimalThreshold } from '@/scripts/tli/comparison/auto-tune'
import { batchQuery } from '@/scripts/tli/shared/supabase-batch'

describe('auto-tune eval pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.errorFrom = -1
    db.candidateErrorFrom = -1
    db.evals = Array.from({ length: 5100 }, (_, i) => ({
      run_id: 'run', candidate_theme_id: `theme-${i}`, trajectory_corr_h14: 0.8,
    }))
    db.candidates = db.evals.map(row => ({ ...row, similarity_score: 0.45 }))
  })

  it('uses rows after 999 and stops at the intended 5000-row bound', async () => {
    expect(await computeOptimalThreshold()).toMatchObject({ sampleSize: 5000, threshold: 0.45 })
    expect(db.range.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3999], [4000, 4999]])
    expect(db.order).toHaveBeenCalledWith('evaluated_at', { ascending: false })
    expect(db.order).toHaveBeenCalledWith('id', undefined)
    expect(batchQuery).toHaveBeenCalledWith(
      'theme_comparison_candidates_v2', 'run_id, candidate_theme_id, similarity_score', ['run'],
      undefined, 'run_id', { failOnError: true, orderBy: { column: 'id' } },
    )
  })

  it('throws a later eval page error without tuning partial data', async () => {
    db.errorFrom = 1000
    await expect(computeOptimalThreshold()).rejects.toThrow('eval page failed')
    expect(batchQuery).not.toHaveBeenCalled()
  })

  it('propagates a candidate batch failure', async () => {
    vi.useFakeTimers()
    db.candidateErrorFrom = 1000
    try {
      const assertion = expect(computeOptimalThreshold()).rejects.toThrow('candidate page failed')
      await vi.runAllTimersAsync()
      await assertion
      expect(db.candidateRange.mock.calls).toEqual([[0, 999], [1000, 1999], [1000, 1999], [1000, 1999]])
    } finally {
      vi.useRealTimers()
    }
  })
})
