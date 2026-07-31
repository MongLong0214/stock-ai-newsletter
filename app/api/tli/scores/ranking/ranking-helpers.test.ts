import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeListItem } from '@/lib/tli/types'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  getServerSupabaseClient: () => ({
    rpc: rpcMock,
  }),
}))

import {
  SCORE_QUERY_BATCH_SIZE,
  applyFreshnessDecayToThemeData,
  batchLoadNewsCounts,
  buildCountMaps,
  buildThemeRanking,
} from './ranking-helpers'
import { THEME_SCORE_WINDOW_MAX_THEMES } from '@/lib/tli/rpc/score-windows'

beforeEach(() => {
  rpcMock.mockReset()
})

function makeTheme(overrides: Partial<ThemeListItem> = {}): ThemeListItem {
  return {
    id: overrides.id ?? 'theme-1',
    name: overrides.name ?? 'Theme 1',
    nameEn: overrides.nameEn ?? null,
    score: overrides.score ?? 60,
    stage: overrides.stage ?? 'Growth',
    stageKo: overrides.stageKo ?? '성장',
    change7d: overrides.change7d ?? 0,
    stockCount: overrides.stockCount ?? 4,
    topStocks: overrides.topStocks ?? [],
    isReigniting: overrides.isReigniting ?? false,
    updatedAt: overrides.updatedAt ?? '2026-03-12',
    sparkline: overrides.sparkline ?? [55, 58, 60],
    newsCount7d: overrides.newsCount7d ?? 3,
    confidenceLevel: overrides.confidenceLevel,
    avgStockChange: overrides.avgStockChange ?? null,
  }
}

describe('buildThemeRanking', () => {
  it('computes summary from uncapped eligible themes while keeping display caps', () => {
    const emerging = Array.from({ length: 13 }, (_, index) =>
      makeTheme({
        id: `emerging-${index + 1}`,
        name: `Emerging ${index + 1}`,
        stage: 'Emerging',
        stageKo: '초기',
        score: 50 + index,
      }),
    )
    const growth = [
      makeTheme({
        id: 'growth-1',
        name: 'Growth 1',
        stage: 'Growth',
        stageKo: '성장',
        score: 72,
      }),
    ]
    const ineligible = makeTheme({
      id: 'low-score',
      name: 'Low Score',
      stage: 'Emerging',
      stageKo: '초기',
      score: 20,
    })

    const ranking = buildThemeRanking([...emerging, ...growth, ineligible])

    expect(ranking.emerging).toHaveLength(12)
    expect(ranking.summary.totalThemes).toBe(14)
    expect(ranking.summary.trackedThemes).toBe(15)
    expect(ranking.summary.visibleThemes).toBe(13)
    expect(ranking.summary.byStage.Emerging).toBe(13)
    expect(ranking.summary.byStage.Growth).toBe(1)
  })

  it('applies the raw-interest filter when selecting the surging theme', () => {
    const noisySurge = makeTheme({
      id: 'noisy',
      name: 'Noisy',
      stage: 'Growth',
      stageKo: '성장',
      score: 67,
      change7d: 11,
      newsCount7d: 4,
      sparkline: [54, 58, 67],
    })
    const credibleSurge = makeTheme({
      id: 'credible',
      name: 'Credible',
      stage: 'Emerging',
      stageKo: '초기',
      score: 63,
      change7d: 8,
      newsCount7d: 5,
      sparkline: [51, 56, 63],
    })

    const ranking = buildThemeRanking(
      [noisySurge, credibleSurge],
      new Map([
        ['noisy', 2],
        ['credible', 9],
      ]),
    )

    expect(ranking.summary.surging?.id).toBe('credible')
  })

  it('applies freshness decay through the shared theme normalization helper', () => {
    const themes = [
      makeTheme({
        id: 'stale',
        score: 80,
        updatedAt: '2026-02-20T00:00:00.000Z',
      }),
    ]

    const normalized = applyFreshnessDecayToThemeData(
      themes,
      new Map([
        ['stale', { latest: null, weekAgoScore: null, sparkline: [], lastDataDate: '2026-02-20' }],
      ]),
      '2026-03-12',
    )

    expect(normalized[0].score).toBeLessThan(80)
  })

  it('builds today signals from the uncapped eligible emerging pool', () => {
    const emerging = Array.from({ length: 13 }, (_, index) =>
      makeTheme({
        id: `emerging-${index + 1}`,
        name: `Emerging ${index + 1}`,
        stage: 'Emerging',
        stageKo: '초기',
        score: 50 + index,
        change7d: index,
      }),
    )

    const ranking = buildThemeRanking(emerging)

    expect(ranking.emerging.map((theme) => theme.id)).not.toContain('emerging-13')
    expect(ranking.signals.find((signal) => signal.key === 'emerging')?.themes.map((theme) => theme.id))
      .toContain('emerging-13')
  })

  it('keeps the score query chunk within the RPC theme limit', () => {
    // PostgREST 1000행 상한이 아니라 load_theme_score_windows의 테마 수 상한이
    // 유일한 제약이다. 두 값이 어긋나면 청크 하나가 통째로 error를 받는다.
    expect(SCORE_QUERY_BATCH_SIZE).toBe(THEME_SCORE_WINDOW_MAX_THEMES)
    expect(SCORE_QUERY_BATCH_SIZE).toBeLessThanOrEqual(THEME_SCORE_WINDOW_MAX_THEMES)
  })
})

describe('batchLoadNewsCounts', () => {
  it('loads aggregated news counts through the get_theme_news_counts RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { theme_id: 'theme-1', news_count: 3 },
        { theme_id: 'theme-2', news_count: 1 },
      ],
      error: null,
    })

    const counts = await batchLoadNewsCounts(['theme-1', 'theme-2'], '2026-07-01')
    const { newsCountMap } = buildCountMaps([], counts)

    expect(rpcMock).toHaveBeenCalledWith('get_theme_news_counts', {
      p_theme_ids: ['theme-1', 'theme-2'],
      p_since: '2026-07-01',
    })
    expect(newsCountMap.get('theme-1')).toBe(3)
    expect(newsCountMap.get('theme-2')).toBe(1)
    expect(newsCountMap.get('theme-3')).toBeUndefined()
  })

  it('returns zero effective counts when the news-count RPC fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'statement timeout' },
    })

    const counts = await batchLoadNewsCounts(['theme-1'], '2026-07-01')
    const { newsCountMap } = buildCountMaps([], counts)

    expect(counts).toEqual([])
    expect(newsCountMap.get('theme-1')).toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[TLI] theme news count RPC failed:',
      {
        themeCount: 1,
        since: '2026-07-01',
        error: 'statement timeout',
      },
    )

    consoleErrorSpy.mockRestore()
  })
})
