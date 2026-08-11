import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { rpcMock, rangeMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  rangeMock: vi.fn(),
}))

// Mock supabase module — tests verify the RPC wrapper independently
const mockSupabase = { rpc: rpcMock } as unknown as SupabaseClient

import {
  loadThemeScoreWindows,
  loadLatestPublishedComparisonRuns,
  type ScoreWindowRow,
  type LatestComparisonRunRow,
} from '@/lib/tli/rpc/score-windows'

beforeEach(() => {
  rpcMock.mockReset()
  rangeMock.mockReset()
})

function mockScoreRpcResponse(response: unknown): void {
  rpcMock.mockReturnValue({ range: rangeMock })
  rangeMock.mockResolvedValue(response)
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const THEME_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const THEME_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const SCORE_ROW: ScoreWindowRow = {
  id: '11111111-1111-4111-1111-111111111111',
  theme_id: THEME_A,
  score: 72,
  stage: 'Growth',
  is_reigniting: false,
  calculated_at: '2026-07-30',
  components: { confidence: { level: 'high' } },
}

const COMPARISON_ROW: LatestComparisonRunRow = {
  id: '22222222-2222-4222-2222-222222222222',
  current_theme_id: THEME_A,
  created_at: '2026-07-30T09:00:00Z',
}

// ─── load_theme_score_windows ───────────────────────────────────────────────

describe('loadThemeScoreWindows', () => {
  it('calls the correct RPC with parameters', async () => {
    mockScoreRpcResponse({ data: [SCORE_ROW], error: null })

    const result = await loadThemeScoreWindows(
      mockSupabase,
      [THEME_A, THEME_B],
      '2026-07-23',
      '2026-07-22',
    )

    expect(rpcMock).toHaveBeenCalledWith('load_theme_score_windows', {
      p_theme_ids: [THEME_A, THEME_B],
      p_recent_since: '2026-07-23',
      p_previous_on_or_before: '2026-07-22',
    })
    expect(rangeMock).toHaveBeenCalledWith(0, 999)
    expect(result.data).toEqual([SCORE_ROW])
    expect(result.error).toBeNull()
  })

  it('omits p_previous_on_or_before when not provided', async () => {
    mockScoreRpcResponse({ data: [], error: null })

    await loadThemeScoreWindows(mockSupabase, [THEME_A], '2026-07-23')

    expect(rpcMock).toHaveBeenCalledWith('load_theme_score_windows', {
      p_theme_ids: [THEME_A],
      p_recent_since: '2026-07-23',
    })
  })

  it('returns empty data for empty theme array without calling RPC', async () => {
    const result = await loadThemeScoreWindows(mockSupabase, [], '2026-07-23')

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })

  it('rejects with client-side error when exceeding 500 themes', async () => {
    const themeIds = Array.from({ length: 501 }, (_, i) =>
      `${String(i).padStart(8, '0')}-0000-4000-0000-000000000000`
    )

    const result = await loadThemeScoreWindows(mockSupabase, themeIds, '2026-07-23')

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toContain('exceeded 500')
  })

  it('wraps supabase error into result.error', async () => {
    mockScoreRpcResponse({
      data: null,
      error: { message: 'relation "lifecycle_scores" does not exist' },
    })

    const result = await loadThemeScoreWindows(mockSupabase, [THEME_A], '2026-07-23')

    expect(result.data).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toContain('RPC failed')
  })

  it('wraps unexpected thrown exceptions', async () => {
    rpcMock.mockImplementation(() => {
      throw new Error('network timeout')
    })

    const result = await loadThemeScoreWindows(mockSupabase, [THEME_A], '2026-07-23')

    expect(result.data).toEqual([])
    expect(result.error!.message).toBe('network timeout')
  })

  it('returns typed ScoreWindowRow array from successful call', async () => {
    const rows: ScoreWindowRow[] = [
      { ...SCORE_ROW, theme_id: THEME_A, calculated_at: '2026-07-30' },
      { ...SCORE_ROW, id: '33333333-3333-4333-3333-333333333333', theme_id: THEME_B, calculated_at: '2026-07-29' },
    ]
    mockScoreRpcResponse({ data: rows, error: null })

    const result = await loadThemeScoreWindows(mockSupabase, [THEME_A, THEME_B], '2026-07-23')

    expect(result.data).toHaveLength(2)
    expect(result.data[0].theme_id).toBe(THEME_A)
    expect(result.data[1].theme_id).toBe(THEME_B)
  })

  it('loads a second RPC page after a full first page', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      ...SCORE_ROW,
      id: `first-${index}`,
    }))
    const finalRow = { ...SCORE_ROW, id: 'final-row' }
    rpcMock.mockReturnValue({ range: rangeMock })
    rangeMock.mockImplementation((from: number) => Promise.resolve({
      data: from === 0 ? firstPage : [finalRow],
      error: null,
    }))

    const result = await loadThemeScoreWindows(mockSupabase, [THEME_A], '2026-07-23')

    expect(rangeMock).toHaveBeenNthCalledWith(1, 0, 999)
    expect(rangeMock).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(result.data).toHaveLength(1001)
    expect(result.data.at(-1)).toEqual(finalRow)
    expect(result.error).toBeNull()
  })
})

// ─── load_latest_published_comparison_runs ──────────────────────────────────

describe('loadLatestPublishedComparisonRuns', () => {
  it('calls the correct RPC with theme IDs', async () => {
    rpcMock.mockResolvedValue({ data: [COMPARISON_ROW], error: null })

    const result = await loadLatestPublishedComparisonRuns(mockSupabase, [THEME_A, THEME_B])

    expect(rpcMock).toHaveBeenCalledWith('load_latest_published_comparison_runs', {
      p_theme_ids: [THEME_A, THEME_B],
    })
    expect(result.data).toEqual([COMPARISON_ROW])
    expect(result.error).toBeNull()
  })

  it('returns empty data for empty theme array without calling RPC', async () => {
    const result = await loadLatestPublishedComparisonRuns(mockSupabase, [])

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })

  it('rejects with client-side error when exceeding 100 themes', async () => {
    const themeIds = Array.from({ length: 101 }, (_, i) =>
      `${String(i).padStart(8, '0')}-0000-4000-0000-000000000000`
    )

    const result = await loadLatestPublishedComparisonRuns(mockSupabase, themeIds)

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toContain('exceeded 100')
  })

  it('wraps supabase error into result.error', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function does not exist' },
    })

    const result = await loadLatestPublishedComparisonRuns(mockSupabase, [THEME_A])

    expect(result.data).toEqual([])
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toContain('RPC failed')
  })

  it('wraps unexpected thrown exceptions', async () => {
    rpcMock.mockRejectedValue(new TypeError('fetch failed'))

    const result = await loadLatestPublishedComparisonRuns(mockSupabase, [THEME_A])

    expect(result.data).toEqual([])
    expect(result.error!.message).toBe('fetch failed')
  })
})
