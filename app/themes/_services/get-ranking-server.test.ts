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
          eq: () => Promise.resolve({ data: themes, error: null }),
        }),
      }
    }

    if (table === 'lifecycle_scores') {
      return {
        select: () => ({
          in: (_column: string, themeIds: string[]) => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve(scoreResultForChunk(themeIds)),
              }),
            }),
          }),
        }),
      }
    }

    throw new Error(`unexpected table: ${table}`)
  })
}

describe('getRankingServer', () => {
  it('keeps successful score chunks when another score chunk times out', async () => {
    // Given
    const themes = createThemes(11)
    const scoreByTheme = new Map(themes.map((theme, index) => [theme.id, createScore(theme.id, index)]))
    setupSupabase(themes, (themeIds) => {
      if (!themeIds.includes('theme-11')) {
        return { data: null, error: { message: 'canceling statement due to statement timeout' } }
      }
      const score = scoreByTheme.get('theme-11')
      return { data: score ? [score] : [], error: null }
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // When
    const ranking = await getRankingServer('2026-07-14')

    // Then
    expect(ranking.summary.trackedThemes).toBe(11)
    expect(ranking.summary.totalThemes).toBe(1)
    expect(ranking.summary.visibleThemes).toBe(1)
    expect(ranking.emerging[0]?.id).toBe('theme-11')
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
    rankingMocks.rpc.mockRejectedValue(new Error('forced news timeout'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // When
    const ranking = await getRankingServer('2026-07-14')

    // Then
    expect(ranking.summary.trackedThemes).toBe(45)
    expect(ranking.summary.totalThemes).toBe(45)
    expect(ranking.summary.visibleThemes).toBe(45)
  })
})
