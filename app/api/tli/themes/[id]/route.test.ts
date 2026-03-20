import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchThemeData = vi.fn()
const buildComparisonResults = vi.fn()
vi.mock('./fetch-theme-data', () => ({
  fetchThemeData,
  findCriticalThemeDetailError: (result: {
    scoresRes: { error: { message?: string } | null }
    comparisonsRes: { error: { code?: string; message?: string } | null }
    newsRes: { error: { message?: string } | null }
    interestRes: { error: { message?: string } | null }
    keywordsRes: { error: { message?: string } | null }
    latestScoreRes: { error: { message?: string } | null }
  }) => (
    result.latestScoreRes.error
    || result.scoresRes.error
    || (result.comparisonsRes.error?.code === 'CERTIFICATION_REQUIRED' ? null : result.comparisonsRes.error)
    || result.newsRes.error
    || result.interestRes.error
    || result.keywordsRes.error
  ),
}))

vi.mock('./build-comparisons', () => ({
  buildComparisonResults,
}))

vi.mock('@/lib/supabase', () => ({
  isSupabasePlaceholder: false,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: '63a8695b-59c1-4aeb-a4e2-f0e71dc5be26',
                name: 'Theme',
                name_en: null,
                description: null,
                first_spike_date: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}))

describe('theme detail route', () => {
  beforeEach(() => {
    fetchThemeData.mockReset()
    buildComparisonResults.mockReset()
  })

  it('returns a server error when critical detail queries fail instead of emitting a degraded success payload', async () => {
    fetchThemeData.mockResolvedValue({
      latestScoreRes: { data: [], error: null },
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

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/themes/x') as never, {
      params: Promise.resolve({ id: '63a8695b-59c1-4aeb-a4e2-f0e71dc5be26' }),
    })

    expect(response.status).toBe(500)
  })

  it('returns 200 when comparison serving is certification-gated and degrades comparisons to empty', async () => {
    fetchThemeData.mockResolvedValue({
      latestScoreRes: {
        data: [{ score: 50, stage: 'Growth', is_reigniting: false, calculated_at: '2026-03-20', components: null }],
        error: null,
      },
      scoresRes: {
        data: [{ score: 50, stage: 'Growth', is_reigniting: false, calculated_at: '2026-03-20', components: null }],
        error: null,
      },
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
    buildComparisonResults.mockResolvedValue([])

    const { GET } = await import('./route')
    const response = await GET(new Request('http://localhost/api/tli/themes/x') as never, {
      params: Promise.resolve({ id: '63a8695b-59c1-4aeb-a4e2-f0e71dc5be26' }),
    })

    expect(response.status).toBe(200)
  })
})
