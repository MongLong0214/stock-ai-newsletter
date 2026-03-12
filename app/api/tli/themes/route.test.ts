import { describe, expect, it } from 'vitest'
import type { ThemeScoreMeta } from '../scores/ranking/ranking-helpers'
import { THEME_LIST_SCORE_BATCH_SIZE, buildThemeListResults } from './route'

describe('theme list route batching', () => {
  it('uses a score batch size that stays under the 1000-row cap for a 90-day window', () => {
    expect(THEME_LIST_SCORE_BATCH_SIZE).toBe(10)
    expect(THEME_LIST_SCORE_BATCH_SIZE * 90).toBeLessThanOrEqual(1000)
  })

  it('applies freshness decay to stale scores so this endpoint matches the main ranking contract', () => {
    const scoreMetaByTheme = new Map<string, ThemeScoreMeta>([
      ['theme-1', {
        latest: {
          theme_id: 'theme-1',
          score: 80,
          stage: 'Growth',
          is_reigniting: false,
          calculated_at: '2026-02-20T00:00:00Z',
          components: null,
        },
        weekAgoScore: null,
        sparkline: [],
        lastDataDate: '2026-02-20',
      }],
    ])

    const results = buildThemeListResults({
      themes: [{ id: 'theme-1', name: 'Theme 1', name_en: null }],
      scoreMetaByTheme,
      stockCountMap: new Map([['theme-1', 3]]),
      todayStr: '2026-03-12',
    })

    expect(results[0].score).toBeLessThan(80)
    expect(results[0].updatedAt).toBe('2026-02-20T00:00:00Z')
  })
})
