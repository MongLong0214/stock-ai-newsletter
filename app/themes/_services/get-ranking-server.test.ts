import { beforeEach, describe, expect, it, vi } from 'vitest'
type ThemeRow = {
  readonly id: string
  readonly name: string
  readonly name_en: string | null
}

type StockRow = {
  readonly theme_id: string
  readonly name: string
  readonly price_change_pct: number | null
}

type ScoreRow = {
  readonly theme_id: string
  readonly score: number
  readonly stage: string
  readonly is_reigniting: boolean
  readonly calculated_at: string
  readonly components: Record<string, never>
}

type ScoreQueryResult = {
  readonly data: ScoreRow[] | null
  readonly error: { readonly message: string } | null
}

const rankingMocks = vi.hoisted(() => ({
  from: vi.fn<(table: string) => unknown>(),
  rpc: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  loadStocks: vi.fn<(themeIds: string[]) => Promise<StockRow[]>>(),
}))

vi.mock('@/lib/supabase', () => ({
  isSupabasePlaceholder: false,
}))

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: () => ({
    from: rankingMocks.from,
    rpc: rankingMocks.rpc,
  }),
}))

vi.mock('@/app/api/tli/scores/ranking/ranking-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/api/tli/scores/ranking/ranking-helpers')>()
  return {
    ...actual,
    batchLoadStockData: rankingMocks.loadStocks,
  }
})

import { getRankingServer } from './get-ranking-server'

beforeEach(() => {
  vi.restoreAllMocks()
  rankingMocks.from.mockReset()
  rankingMocks.rpc.mockReset()
  rankingMocks.order.mockReset()
  rankingMocks.range.mockReset()
  rankingMocks.loadStocks.mockReset()
  rankingMocks.loadStocks.mockResolvedValue([])
  rankingMocks.rpc.mockResolvedValue({ data: [], error: null })
})

function createThemes(count: number): ThemeRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `theme-${index + 1}`,
    name: `Theme ${index + 1}`,
    name_en: null,
  }))
}

function createScore(themeId: string, index: number): ScoreRow {
  const stage = index < 12 ? 'Emerging' : index < 27 ? 'Growth' : 'Peak'
  return {
    theme_id: themeId,
    score: 60,
    stage,
    is_reigniting: false,
    calculated_at: '2026-07-14',
    components: {},
  }
}

function setupSupabase(
  themes: ThemeRow[],
  scoreResultForChunk: (themeIds: string[]) => ScoreQueryResult,
): void {
  rankingMocks.from.mockImplementation((table) => {
    if (table === 'themes') {
      return {
        select: () => ({
          eq: () => ({
            order: rankingMocks.order,
          }),
        }),
      }
    }

    throw new Error(`unexpected table: ${table}`)
  })
  rankingMocks.order.mockReturnValue({ range: rankingMocks.range })
  rankingMocks.range.mockImplementation((from: number, to: number) => Promise.resolve({
    data: themes.slice(from, to + 1),
    error: null,
  }))

  // loadThemeScoreWindows calls supabase.rpc('load_theme_score_windows', ...)
  rankingMocks.rpc.mockImplementation((name: string, params: { p_theme_ids: string[] }) => {
    if (name === 'load_theme_score_windows') {
      return {
        range: () => Promise.resolve(scoreResultForChunk(params.p_theme_ids)),
      }
    }
    // Default: news RPC etc.
    return Promise.resolve({ data: [], error: null })
  })
}

describe('getRankingServer', () => {
  it('loads the next active-theme page after a full PostgREST page', async () => {
    const themes = createThemes(1001)
    const scoreByTheme = new Map(themes.map((theme, index) => [theme.id, createScore(theme.id, index)]))
    setupSupabase(themes, (themeIds) => ({
      data: themeIds.flatMap((themeId) => {
        const score = scoreByTheme.get(themeId)
        return score ? [score] : []
      }),
      error: null,
    }))

    const ranking = await getRankingServer('2026-07-14')

    expect(rankingMocks.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(rankingMocks.range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(rankingMocks.range).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(ranking.summary.trackedThemes).toBe(1001)
    expect(ranking.summary.totalThemes).toBe(1001)
  })

  it('keeps successful score chunks when another score chunk times out', async () => {
    // Given: 501 themes to force two RPC chunks (chunk size = 500)
    // First chunk (1-500) fails, second chunk (501) succeeds
    const themes = createThemes(501)
    const scoreForTheme501 = createScore('theme-501', 0) // Emerging

    setupSupabase(themes, (themeIds) => {
      if (themeIds.includes('theme-501') && themeIds.length === 1) {
        return { data: [scoreForTheme501], error: null }
      }
      return { data: null, error: { message: 'canceling statement due to statement timeout' } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // When
    const ranking = await getRankingServer('2026-07-14')

    // Then: only theme-501 has score data
    expect(ranking.summary.trackedThemes).toBe(501)
    expect(ranking.summary.totalThemes).toBe(1)
    expect(ranking.summary.visibleThemes).toBe(1)
    expect(ranking.emerging[0]?.id).toBe('theme-501')
  })

  it('returns all score-backed themes when the news source throws', async () => {
    // Given
    const themes = createThemes(45)
    const scoreByTheme = new Map(themes.map((theme, index) => [theme.id, createScore(theme.id, index)]))
    setupSupabase(themes, (themeIds) => ({
      data: themeIds.flatMap((themeId) => {
        const score = scoreByTheme.get(themeId)
        return score ? [score] : []
      }),
      error: null,
    }))
    // Override the RPC mock to make the news RPC throw while score RPC still works
    rankingMocks.rpc.mockImplementation((name: string, params: { p_theme_ids?: string[] }) => {
      if (name === 'load_theme_score_windows') {
        const themeIds = params.p_theme_ids ?? []
        return {
          range: () => Promise.resolve({
            data: themeIds.flatMap((themeId) => {
              const score = scoreByTheme.get(themeId)
              return score ? [score] : []
            }),
            error: null,
          }),
        }
      }
      // News RPC: throw
      return Promise.reject(new Error('forced news timeout'))
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // When
    const ranking = await getRankingServer('2026-07-14')

    // Then
    expect(ranking.summary.trackedThemes).toBe(45)
    expect(ranking.summary.totalThemes).toBe(45)
    expect(ranking.summary.visibleThemes).toBe(45)
  })
})
