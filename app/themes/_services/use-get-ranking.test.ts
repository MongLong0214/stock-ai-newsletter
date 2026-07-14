import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { EMPTY_RANKING } from '@/app/api/tli/scores/ranking/ranking-helpers'

type CapturedRankingQueryOptions = {
  readonly queryKey: readonly unknown[]
  readonly queryFn: () => Promise<ThemeRanking>
  readonly staleTime: number
  readonly gcTime: number
  readonly initialData?: ThemeRanking
  readonly initialDataUpdatedAt?: number
}

const queryMocks = vi.hoisted(() => ({
  getRanking: vi.fn<() => Promise<ThemeRanking>>(),
  useQuery: vi.fn<(options: CapturedRankingQueryOptions) => CapturedRankingQueryOptions>(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: queryMocks.useQuery }
})

vi.mock('../_apis', () => ({
  getRanking: queryMocks.getRanking,
}))

import { useGetRanking } from './use-get-ranking'

const THEME: ThemeListItem = {
  id: 'theme-1',
  name: '테스트 테마',
  nameEn: 'Test theme',
  score: 60,
  stage: 'Growth',
  stageKo: '성장',
  change7d: 4,
  stockCount: 3,
  topStocks: ['테스트 종목'],
  isReigniting: false,
  updatedAt: '2026-07-14',
  sparkline: [55, 58, 60],
  newsCount7d: 2,
  confidenceLevel: 'high',
  avgStockChange: 1.2,
}

const NON_EMPTY_RANKING: ThemeRanking = {
  ...EMPTY_RANKING,
  growth: [THEME],
  summary: {
    ...EMPTY_RANKING.summary,
    totalThemes: 1,
    trackedThemes: 1,
    visibleThemes: 1,
    byStage: { Growth: 1 },
    hottestTheme: {
      id: THEME.id,
      name: THEME.name,
      score: THEME.score,
      stage: THEME.stage,
      stockCount: THEME.stockCount,
    },
    avgScore: THEME.score,
  },
}

beforeEach(() => {
  queryMocks.getRanking.mockReset()
  queryMocks.useQuery.mockReset()
  queryMocks.useQuery.mockImplementation((options) => options)
})

function getCapturedOptions(): CapturedRankingQueryOptions {
  const options = queryMocks.useQuery.mock.calls[0]?.[0]
  if (!options) throw new Error('ranking query options were not captured')
  return options
}

describe('useGetRanking', () => {
  it('fetches on mount when the supplied initial ranking is empty', async () => {
    // Given
    queryMocks.getRanking.mockResolvedValue(NON_EMPTY_RANKING)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // When
    useGetRanking(EMPTY_RANKING)
    const result = await queryClient.fetchQuery(getCapturedOptions())

    // Then
    expect(queryMocks.getRanking).toHaveBeenCalledOnce()
    expect(result).toBe(NON_EMPTY_RANKING)
  })

  it('uses a non-empty initial ranking without fetching immediately', async () => {
    // Given
    queryMocks.getRanking.mockResolvedValue(EMPTY_RANKING)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // When
    useGetRanking(NON_EMPTY_RANKING)
    const result = await queryClient.fetchQuery(getCapturedOptions())

    // Then
    expect(queryMocks.getRanking).not.toHaveBeenCalled()
    expect(result).toBe(NON_EMPTY_RANKING)
  })
})
