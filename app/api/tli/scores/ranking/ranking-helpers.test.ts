import { describe, expect, it } from 'vitest'
import type { ThemeListItem } from '@/lib/tli/types'
import { SCORE_QUERY_BATCH_SIZE, applyFreshnessDecayToThemeData, buildThemeRanking } from './ranking-helpers'

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

    const ranking = buildThemeRanking([...emerging, ...growth])

    expect(ranking.emerging).toHaveLength(12)
    expect(ranking.summary.totalThemes).toBe(14)
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

  it('uses a score query batch size that stays under the Supabase 1000-row cap for a 90-day window', () => {
    expect(SCORE_QUERY_BATCH_SIZE).toBe(10)
    expect(SCORE_QUERY_BATCH_SIZE * 90).toBeLessThanOrEqual(1000)
  })
})
