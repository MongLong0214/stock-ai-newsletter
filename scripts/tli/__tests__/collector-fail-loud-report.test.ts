import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectForecastInterestRuns, collectNaverDatalab } from '../collectors/naver-datalab'
import { collectNaverNews } from '../collectors/naver-news'
import type { CollectionRunTransport } from '../collectors/collection-run-store'

const THEME_A = '11111111-1111-4111-8111-111111111111'
const THEME_B = '22222222-2222-4222-8222-222222222222'
const DATALAB_WINDOW = { start: '2026-06-15', end: '2026-06-19' }
const NEWS_WINDOW = { start: '2026-06-08', end: '2026-06-22' }
const reserveAttempt = async () => undefined

const mockFetchJson = (payload: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

const validDatalabResult = (title: string) => ({
  title,
  keywords: [title.toLowerCase()],
  data: [{ period: '2026-06-15', ratio: 42 }],
})

describe('collector fail-loud report', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'id'
    process.env.NAVER_CLIENT_SECRET = 'secret'
    process.env.TLI_ANCHOR_ENABLED = 'false'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('DataLab snapshot append failure is visible in the typed report', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ results: [validDatalabResult('A')] }))
    const transport: CollectionRunTransport = async () => {
      throw new Error('snapshot rejected')
    }

    const result = await collectNaverDatalab(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      DATALAB_WINDOW.start,
      DATALAB_WINDOW.end,
      { transport, reserveAttempt },
    )

    expect(result).toEqual({
      metrics: [],
      report: { requested: 1, succeeded: 0, failed: 1, persistenceFailed: 1 },
    })
  })

  it('a persisted partial DataLab run is still reported as failed', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ results: [validDatalabResult('A')] }))
    const transport: CollectionRunTransport = async () => '44444444-4444-4444-8444-444444444444'

    const result = await collectNaverDatalab(
      [
        { id: THEME_A, name: 'A', naverKeywords: ['a'] },
        { id: THEME_B, name: 'B', naverKeywords: ['b'] },
      ],
      DATALAB_WINDOW.start,
      DATALAB_WINDOW.end,
      { transport, reserveAttempt },
    )

    expect(result.metrics).toHaveLength(1)
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
  })

  it('forecast snapshot append failure is no longer an ignored best-effort result', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ results: [validDatalabResult('A')] }))
    const transport: CollectionRunTransport = async () => {
      throw new Error('forecast snapshot rejected')
    }

    const report = await collectForecastInterestRuns(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      '2026-06-22',
      { transport, reserveAttempt },
    )

    expect(report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 1 })
  })

  it('news snapshot append failure is visible in the typed report', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ total: 0, items: [] }))
    const transport: CollectionRunTransport = async () => {
      throw new Error('news snapshot rejected')
    }

    const result = await collectNaverNews(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      NEWS_WINDOW.start,
      NEWS_WINDOW.end,
      { transport },
    )

    expect(result).toEqual({
      metrics: [],
      articles: [],
      report: { requested: 1, succeeded: 0, failed: 1, persistenceFailed: 1 },
    })
  })
})
