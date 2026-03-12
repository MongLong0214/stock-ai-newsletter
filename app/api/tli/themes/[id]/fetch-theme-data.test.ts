import { describe, expect, it } from 'vitest'
import {
  COMPARISON_FETCH_LIMIT,
  findCriticalThemeDetailError,
  shouldFallbackThemeStocksMetricsQuery,
} from './fetch-theme-data'

describe('fetchThemeData comparison sampling', () => {
  it('uses a wider comparison pool than the minimum prediction threshold', () => {
    expect(COMPARISON_FETCH_LIMIT).toBe(12)
    expect(COMPARISON_FETCH_LIMIT).toBeGreaterThan(3)
  })

  it('falls back on theme_stocks only when metric columns are missing', () => {
    expect(shouldFallbackThemeStocksMetricsQuery({ code: '42703', message: 'column theme_stocks.current_price does not exist' })).toBe(true)
    expect(shouldFallbackThemeStocksMetricsQuery({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(shouldFallbackThemeStocksMetricsQuery({ message: 'connection lost' })).toBe(false)
  })

  it('treats score/news/interest/keyword/comparison query errors as critical for detail responses', () => {
    const error = findCriticalThemeDetailError({
      latestScoreRes: { data: null, error: null },
      scoresRes: { data: null, error: { message: 'scores failed' } },
      stocksRes: { data: [], error: null },
      comparisonsRes: { data: [], error: null },
      newsRes: { data: [], error: null },
      interestRes: { data: [], error: null },
      newsArticlesRes: { data: [], error: null },
      keywordsRes: { data: [], error: null },
      stockCount: 0,
      newsArticleCount: 0,
    })

    expect(error?.message).toContain('scores failed')
  })
})
