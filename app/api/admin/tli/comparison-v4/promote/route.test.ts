import { beforeEach, describe, expect, it, vi } from 'vitest'

const promoteComparisonV4Runs = vi.fn()

vi.mock('@/scripts/tli/comparison-v4-orchestration', () => ({
  promoteComparisonV4Runs,
}))

// backfill guard: 항상 완료 상태로 mock
vi.mock('@/scripts/tli/theme-state-history', () => ({
  isStateHistoryBackfillComplete: () => true,
}))

vi.mock('@/scripts/tli/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        count: 50,
        error: null,
        // .in() chain for loadRuns
        in: () => Promise.resolve({ data: [], error: null }),
      }),
      update: () => ({
        in: () => Promise.resolve({ error: null }),
        eq: () => Promise.resolve({ error: null }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}))

describe('admin comparison v4 promote route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, ADMIN_SECRET: 'secret' }
    promoteComparisonV4Runs.mockReset()
  })

  it('returns 401 when authorization is missing', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      body: JSON.stringify({ runIds: ['run-1'], productionVersion: 'algo-v4-prod' }),
    }))

    expect(response.status).toBe(401)
  })

  it('returns 400 when runIds are invalid', async () => {
    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({ runIds: [], productionVersion: 'algo-v4-prod' }),
    }))

    expect(response.status).toBe(400)
  })

  it('returns 200 with promotion summary on success', async () => {
    promoteComparisonV4Runs.mockResolvedValue({
      promotedRunIds: ['run-1'],
      skippedRunIds: [],
      report: 'ok',
    })

    const { POST } = await import('./route')
    const response = await POST(new Request('http://localhost/api/admin/tli/comparison-v4/promote', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: JSON.stringify({ runIds: ['run-1'], productionVersion: 'algo-v4-prod' }),
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.promotedRunIds).toEqual(['run-1'])
  })
})
