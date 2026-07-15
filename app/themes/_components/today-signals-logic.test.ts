import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ThemeListItem, ThemeRanking } from '@/lib/tli/types'
import { buildSignalCards } from './today-signals-logic'
import ThemesHeader from './themes-header'
import TodaySignals from './today-signals'

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

function makeRanking(overrides: Partial<ThemeRanking> = {}): ThemeRanking {
  return {
    emerging: overrides.emerging ?? [],
    growth: overrides.growth ?? [],
    peak: overrides.peak ?? [],
    decline: overrides.decline ?? [],
    reigniting: overrides.reigniting ?? [],
    signals: overrides.signals ?? [],
    summary: overrides.summary ?? {
      totalThemes: 0,
      trackedThemes: 0,
      visibleThemes: 0,
      byStage: {},
      hottestTheme: null,
      surging: null,
      avgScore: 0,
    },
  }
}

describe('themes hydration date', () => {
  it('renders the server-provided as-of date independently of the runtime timezone', () => {
    // Given
    const asOfDate = '2026-07-15'
    const ranking = makeRanking({
      growth: [makeTheme({ change7d: 4.1 })],
      signals: [
        {
          key: 'movers',
          title: '점수 급등',
          themes: [{ id: 'theme-1', name: 'Theme 1', detail: '+4.1' }],
        },
      ],
      summary: {
        totalThemes: 1,
        trackedThemes: 1,
        visibleThemes: 1,
        byStage: { Growth: 1 },
        hottestTheme: null,
        surging: null,
        avgScore: 60,
      },
    })
    const originalTimezone = process.env.TZ
    vi.stubGlobal('React', React)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T15:30:00.000Z'))

    try {
      // When
      process.env.TZ = 'UTC'
      const serverMarkup = [
        renderToStaticMarkup(React.createElement(ThemesHeader, { summary: ranking.summary, asOfDate })),
        renderToStaticMarkup(React.createElement(TodaySignals, { ranking, asOfDate })),
      ].join('')

      process.env.TZ = 'Asia/Seoul'
      const clientMarkup = [
        renderToStaticMarkup(React.createElement(ThemesHeader, { summary: ranking.summary, asOfDate })),
        renderToStaticMarkup(React.createElement(TodaySignals, { ranking, asOfDate })),
      ].join('')

      // Then
      expect(serverMarkup).toContain('2026. 7. 15. 기준')
      expect(serverMarkup).toContain('2026년 7월 15일')
      expect(clientMarkup).toBe(serverMarkup)
    } finally {
      process.env.TZ = originalTimezone
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

describe('buildSignalCards', () => {
  it('excludes non-positive movers from the score surge card', () => {
    const ranking = makeRanking({
      growth: [
        makeTheme({ id: 'up-1', name: 'Up 1', change7d: 4.1 }),
        makeTheme({ id: 'flat', name: 'Flat', change7d: 0 }),
        makeTheme({ id: 'down', name: 'Down', change7d: -2.4 }),
      ],
    })

    const signals = buildSignalCards(ranking)
    const movers = signals.find((signal) => signal.key === 'movers')

    expect(movers?.themes.map((theme) => theme.id)).toEqual(['up-1'])
  })

  it('uses an integrity-safe title for emerging themes and limits the pool to strong candidates', () => {
    const ranking = makeRanking({
      emerging: [
        makeTheme({ id: 'em-1', name: 'EM 1', stage: 'Emerging', stageKo: '초기', score: 66, change7d: 3.2 }),
        makeTheme({ id: 'em-2', name: 'EM 2', stage: 'Emerging', stageKo: '초기', score: 62, change7d: 1.4 }),
        makeTheme({ id: 'em-3', name: 'EM 3', stage: 'Emerging', stageKo: '초기', score: 58, change7d: -0.8 }),
      ],
    })

    const signals = buildSignalCards(ranking)
    const emerging = signals.find((signal) => signal.key === 'emerging')

    expect(emerging?.title).toBe('초기 강세')
    expect(emerging?.themes.map((theme) => theme.id)).toEqual(['em-1', 'em-2'])
  })

  it('prefers precomputed server signals when available so capped emerging lists do not hide strong themes', () => {
    const ranking = makeRanking({
      emerging: [
        makeTheme({ id: 'em-1', name: 'EM 1', stage: 'Emerging', stageKo: '초기', score: 50, change7d: 0.5 }),
      ],
      signals: [
        {
          key: 'emerging',
          title: '초기 강세',
          themes: [
            { id: 'em-strong', name: 'EM Strong', detail: '88점' },
          ],
        },
      ],
    })

    const signals = buildSignalCards(ranking)

    expect(signals.find((signal) => signal.key === 'emerging')?.themes.map((theme) => theme.id)).toEqual(['em-strong'])
  })
})
