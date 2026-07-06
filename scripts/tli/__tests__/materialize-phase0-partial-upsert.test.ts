import { beforeEach, describe, expect, it, vi } from 'vitest'

type DbError = { readonly message: string }
type QueryResult = {
  readonly data: readonly Record<string, unknown>[] | null
  readonly error: DbError | null
}

const materializeMocks = vi.hoisted(() => ({
  batchUpsert: vi.fn(),
  batchQuery: vi.fn(),
  rangeCallCount: 0,
}))

vi.mock('@/lib/tli/analog/types', () => ({
  createDefaultPolicyVersions: vi.fn(() => ({ phase0: 'test' })),
}))

vi.mock('@/scripts/tli/ops/run-theme-state-history-backfill', () => ({
  backfillThemeStateHistory: vi.fn(async () => ({ insertedCount: 0 })),
}))

vi.mock('@/scripts/tli/themes/build-episode-registry', () => ({
  buildEpisodesFromHistory: vi.fn(() => [
    {
      theme_id: 'theme-1',
      episode_number: 1,
      boundary_source_start: 'observed',
      boundary_source_end: null,
      episode_start: '2026-01-01',
      episode_end: null,
      is_active: true,
      multi_peak: false,
      primary_peak_date: null,
      peak_score: null,
      policy_versions: {},
    },
  ]),
  inferEpisodesFromScores: vi.fn(() => []),
}))

vi.mock('@/scripts/tli/shared/supabase-batch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/scripts/tli/shared/supabase-batch')>()
  return {
    ...actual,
    batchQuery: materializeMocks.batchQuery,
    batchUpsert: materializeMocks.batchUpsert,
  }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          range: vi.fn(async (): Promise<QueryResult> => {
            const data = materializeMocks.rangeCallCount === 0
              ? [
                  {
                    id: 'theme-1',
                    name: '테마',
                    is_active: true,
                    first_spike_date: null,
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                  },
                ]
              : []
            materializeMocks.rangeCallCount += 1
            return { data, error: null }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        in: vi.fn(async (): Promise<{ readonly error: DbError | null }> => ({ error: null })),
      })),
      insert: vi.fn(async (): Promise<{ readonly error: DbError | null }> => ({ error: null })),
    })),
  },
}))

vi.mock('@/lib/tli/date-utils', () => ({
  getKSTDateString: vi.fn(() => '2026-03-20'),
}))

describe('phase0 materialization partial upsert handling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    materializeMocks.rangeCallCount = 0
    materializeMocks.batchQuery.mockResolvedValue([])
    // batchUpsert (default options) already fails loud internally on any upsert failure —
    // simulate that same real contract instead of resolving with a failedCount for a caller to re-check.
    materializeMocks.batchUpsert.mockImplementation(
      async (_table: string, rows: readonly unknown[], _onConflict: string, label: string) => {
        throw new Error(`${label} 전량 저장 실패 (${rows.length}건)`)
      },
    )
  })

  it('throws instead of reporting success when phase0 episode upsert is partially persisted', async () => {
    // Given: phase0 materialization builds an episode row and storage reports an upsert failure.
    const { materializePhase0Artifacts } = await import('@/scripts/tli/comparison/materialize-phase0-artifacts')

    // When/Then: the materialization surface fails loudly instead of returning success counts.
    await expect(materializePhase0Artifacts()).rejects.toThrow(/phase0 episode registry/i)
  })
})
