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
  buildSurgingNoisePassMap,
  buildThemeRanking,
} from './ranking-helpers'

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

function makeComponents(rawInterestAvg: number | undefined, interestScale?: 'raw' | 'anchor') {
  return {
    interest_score: 0,
    news_momentum: 0,
    volatility_score: 0,
    maturity_ratio: 0,
    raw: { raw_interest_avg: rawInterestAvg, interest_scale: interestScale },
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
      buildSurgingNoisePassMap([
        { theme_id: 'noisy', components: makeComponents(2) },
        { theme_id: 'credible', components: makeComponents(9) },
      ]),
    )

    expect(ranking.summary.surging?.id).toBe('credible')
  })

  it('uses the anchor noise floor when selecting the surging theme', () => {
    const ranking = buildThemeRanking(
      [
        makeTheme({ id: 'below', change7d: 11 }),
        makeTheme({ id: 'at-floor', change7d: 8 }),
      ],
      buildSurgingNoisePassMap([
        { theme_id: 'below', components: makeComponents(0.00299, 'anchor') },
        { theme_id: 'at-floor', components: makeComponents(0.003, 'anchor') },
      ]),
    )

    expect(ranking.summary.surging?.id).toBe('at-floor')
  })

  it('allows a surging theme when no noise map is provided', () => {
    const ranking = buildThemeRanking([makeTheme({ change7d: 8 })])

    expect(ranking.summary.surging?.id).toBe('theme-1')
  })

  it('uses the raw noise floor for rows without an interest scale', () => {
    const passMap = buildSurgingNoisePassMap([
      { theme_id: 'below', components: makeComponents(3.99) },
      { theme_id: 'at-floor', components: makeComponents(4) },
    ])

    expect(passMap.get('below')).toBe(false)
    expect(passMap.get('at-floor')).toBe(true)
  })

  it('keeps the first score row for each theme', () => {
    const passMap = buildSurgingNoisePassMap([
      { theme_id: 'first-passes', components: makeComponents(0.003, 'anchor') },
      { theme_id: 'first-fails', components: makeComponents(0.002, 'anchor') },
      { theme_id: 'missing-interest', components: makeComponents(undefined, 'anchor') },
      { theme_id: 'first-passes', components: makeComponents(0.001, 'anchor') },
      { theme_id: 'first-fails', components: makeComponents(0.1, 'anchor') },
      { theme_id: 'missing-interest', components: makeComponents(0.1, 'anchor') },
    ])

    expect(passMap.get('first-passes')).toBe(true)
    expect(passMap.get('first-fails')).toBe(false)
    expect(passMap.get('missing-interest')).toBe(false)
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

  it('uses a score query batch size that stays under the Supabase 1000-row cap for a 90-day window', () => {
    expect(SCORE_QUERY_BATCH_SIZE).toBe(10)
    expect(SCORE_QUERY_BATCH_SIZE * 90).toBeLessThanOrEqual(1000)
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
