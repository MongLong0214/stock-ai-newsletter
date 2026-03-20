import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findCriticalThemeDetailError,
  isNonCriticalComparisonDetailError,
  shouldFallbackThemeStocksMetricsQuery,
} from './fetch-theme-data'

describe('fetchThemeData comparison sampling', () => {
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

  it('treats comparison certification gating as non-critical and degrades to an empty comparison list', () => {
    expect(
      isNonCriticalComparisonDetailError({
        code: 'CERTIFICATION_REQUIRED',
        message: 'Active serving control row is missing a pinned calibration artifact',
      }),
    ).toBe(true)

    const error = findCriticalThemeDetailError({
      latestScoreRes: { data: null, error: null },
      scoresRes: { data: [], error: null },
      stocksRes: { data: [], error: null },
      comparisonsRes: {
        data: null,
        error: {
          code: 'CERTIFICATION_REQUIRED',
          message: 'Active serving control row is missing a pinned calibration artifact',
        },
      },
      newsRes: { data: [], error: null },
      interestRes: { data: [], error: null },
      newsArticlesRes: { data: [], error: null },
      keywordsRes: { data: [], error: null },
      stockCount: 0,
      newsArticleCount: 0,
    })

    expect(error).toBeNull()
  })
})

describe('fetchThemeData v4 migration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('uses the v4 comparison reader instead of querying legacy theme_comparisons directly', async () => {
    const fromMock = vi.fn((table: string) => {
      if (table === 'theme_comparisons') {
        throw new Error('legacy theme_comparisons query should not be used')
      }

      const singleResponse = Promise.resolve({ data: [], error: null })
      const orderedResponse = {
        limit: () => singleResponse,
        then: async (fn: (value: unknown) => unknown) => fn(await singleResponse),
      }

      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => orderedResponse,
            }),
            gte: () => ({
              order: () => orderedResponse,
            }),
            order: () => ({
              limit: () => singleResponse,
            }),
          }),
          gte: () => ({
            order: () => orderedResponse,
          }),
          order: () => orderedResponse,
          in: () => ({
            eq: () => ({
              order: () => orderedResponse,
            }),
          }),
        }),
      }
    })

    const fetchPublishedComparisonRowsV4 = vi.fn().mockResolvedValue({
      data: [{ id: 'v4-row', past_theme_id: 'past-1', similarity_score: 0.7 }],
      error: null,
    })

    vi.doMock('@/lib/supabase', () => ({
      supabase: { from: fromMock },
    }))
    vi.doMock('./comparison-v4-reader', () => ({
      fetchPublishedComparisonRowsV4,
    }))

    const { fetchThemeData: load } = await import('./fetch-theme-data')
    const result = await load({
      id: 'theme-1',
      thirtyDaysAgo: '2026-03-01',
    })

    expect(fetchPublishedComparisonRowsV4).toHaveBeenCalledWith('theme-1')
    expect(result.comparisonsRes.data).toEqual([{ id: 'v4-row', past_theme_id: 'past-1', similarity_score: 0.7 }])
    expect(fromMock).not.toHaveBeenCalledWith('theme_comparisons')
  })
})
