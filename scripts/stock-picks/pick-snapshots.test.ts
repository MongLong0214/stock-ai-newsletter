import { readFile } from 'node:fs/promises'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { from: mocks.from },
}))

import { persistStockPickSnapshot } from '@/scripts/stock-picks/pick-snapshots'

describe('stock pick snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ upsert: mocks.upsert })
  })

  it('keeps migration 064 additive and rerunnable', async () => {
    const migration = await readFile('supabase/migrations/064_stock_pick_snapshots.sql', 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.stock_pick_snapshots')
    expect(migration).toContain('PRIMARY KEY (signal_date, strategy)')
    expect(migration).toContain('ALTER TABLE public.stock_pick_snapshots ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('CREATE POLICY service_role_all_stock_pick_snapshots')
    expect(migration).toContain('REVOKE ALL ON TABLE public.stock_pick_snapshots FROM anon, authenticated')
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i)
  })

  it('upserts the immutable prediction payload on signal date and strategy', async () => {
    const candidate = {
      symbol: 'KOSPI:000001',
      name: '테스트',
      tier: 'breakout' as const,
      rank: 1,
      score: 80,
      close: 10_000,
    }
    const picks = [
      candidate,
      { ...candidate, symbol: 'KOSPI:000002', rank: 2 },
      { ...candidate, symbol: 'KOSDAQ:000003', tier: 'volumeOnly' as const, rank: 3 },
    ]
    const snapshot = {
      signal_date: '2026-09-02',
      strategy: 'volumeBreakoutNoGapUp+volumeOnlyFill',
      strategy_version: 'v1-2026-09-03',
      parameters_hash: 'fixture-hash',
      generated_at: '2026-09-03T00:00:00.000Z',
      git_sha: 'fixture-sha',
      run_id: 'fixture-run',
      funnel: {
        signalDate: '2026-09-02',
        activeMasters: 4,
        withFreshKisRow: 4,
        withCompleteFeatures: 4,
        gatePassed: 4,
        picked: 3,
      },
      picks,
      top_candidates: [...picks, { ...candidate, symbol: 'KOSPI:000004', rank: 4 }],
    }

    await persistStockPickSnapshot(
      snapshot as unknown as Parameters<typeof persistStockPickSnapshot>[0],
    )

    expect(mocks.from).toHaveBeenCalledWith('stock_pick_snapshots')
    expect(mocks.upsert).toHaveBeenCalledWith({
      ...snapshot,
      picks: [...picks],
      top_candidates: snapshot.top_candidates,
    }, { onConflict: 'signal_date,strategy' })
  })
})
