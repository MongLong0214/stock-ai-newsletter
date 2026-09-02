import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectNaverDatalab } from '../collectors/naver-datalab'
import { collectNaverNews } from '../collectors/naver-news'
import type {
  CollectionRunAppendRequest,
  CollectionRunTransport,
} from '../collectors/collection-run-store'

const THEME_ID = '11111111-1111-4111-8111-111111111111'
const THEME = { id: THEME_ID, name: 'HBM', naverKeywords: ['HBM'] }
const reserveAttempt = async () => undefined

const mockFetchJson = (payload: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))

const captureTransport = () => {
  const calls: CollectionRunAppendRequest[] = []
  const transport: CollectionRunTransport = async (request) => {
    calls.push(request)
    return '44444444-4444-4444-8444-444444444444'
  }
  return { calls, transport }
}

const parseRun = (request: CollectionRunAppendRequest) =>
  JSON.parse(request.canonicalJson) as {
    readonly run: {
      readonly status: string
      readonly response_payload: unknown
      readonly failure_summary: { readonly reason: string; readonly message: string } | null
    }
    readonly observations: readonly unknown[]
  }

describe('Naver response Zod boundary', () => {
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

  it('rejects a wrong-typed DataLab ratio instead of manufacturing scientific zero', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{
        title: 'HBM',
        keywords: ['HBM'],
        data: [{ period: '2026-06-15', ratio: 'malformed' }],
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverDatalab([THEME], '2026-06-15', '2026-06-19', { transport, reserveAttempt })

    expect(result.metrics).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
    expect(calls).toHaveLength(1)
    const receipt = parseRun(calls[0])
    expect(receipt.run).toMatchObject({
      status: 'failed',
      response_payload: null,
      failure_summary: { reason: 'naver_datalab_response_invalid' },
    })
    expect(receipt.observations).toEqual([])
  })

  it('rejects a DataLab ratio outside the documented 0..100 boundary', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{
        title: 'HBM',
        keywords: ['HBM'],
        data: [{ period: '2026-06-15', ratio: 101 }],
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverDatalab([THEME], '2026-06-15', '2026-06-19', { transport, reserveAttempt })

    expect(result.metrics).toEqual([])
    expect(parseRun(calls[0]).run.failure_summary?.reason).toBe('naver_datalab_response_invalid')
  })

  it('keeps a valid DataLab zero as a complete scientific observation', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{
        title: 'HBM',
        keywords: ['HBM'],
        data: [{ period: '2026-06-15', ratio: 0 }],
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverDatalab([THEME], '2026-06-15', '2026-06-19', { transport, reserveAttempt })

    expect(result.metrics).toEqual([expect.objectContaining({ rawValue: 0, normalized: 0 })])
    expect(result.report).toEqual({ requested: 1, succeeded: 1, failed: 0, persistenceFailed: 0 })
    expect(parseRun(calls[0]).run.status).toBe('complete')
  })

  it('rejects malformed News URLs and persists a typed failed run', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      total: 1,
      items: [{
        title: 'HBM 신고가',
        link: 'not-a-url',
        originallink: 'still-not-a-url',
        description: '',
        pubDate: 'Wed, 10 Jun 2026 09:00:00 +0900',
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverNews([THEME], '2026-06-08', '2026-06-22', { transport })

    expect(result.metrics).toEqual([])
    expect(result.articles).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
    const receipt = parseRun(calls[0])
    expect(receipt.run.failure_summary?.reason).toBe('naver_news_response_invalid')
    expect(receipt.observations).toEqual([])
  })

  it('rejects impossible News calendar dates instead of accepting Date.parse rollover', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      total: 1,
      items: [{
        title: 'HBM 신고가',
        link: 'https://example.com/news/1',
        originallink: 'https://example.com/news/1',
        description: '',
        pubDate: 'Tue, 31 Feb 2026 00:00:00 +0900',
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverNews([THEME], '2026-02-01', '2026-03-10', { transport })

    expect(result.metrics).toEqual([])
    expect(result.articles).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
    expect(parseRun(calls[0]).run.failure_summary?.reason).toBe('naver_news_response_invalid')
  })

  it('rejects a News title that is blank after HTML stripping instead of persisting scientific zero', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      total: 1,
      items: [{
        title: '<b> </b>&nbsp;',
        link: 'https://example.com/news/1',
        originallink: 'https://example.com/news/1',
        description: '',
        pubDate: 'Wed, 10 Jun 2026 09:00:00 +0900',
      }],
    }))
    const { calls, transport } = captureTransport()

    const result = await collectNaverNews([THEME], '2026-06-08', '2026-06-22', { transport })

    expect(result.metrics).toEqual([])
    expect(result.articles).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
    expect(parseRun(calls[0]).run.failure_summary?.reason).toBe('naver_news_response_invalid')
  })

  it('reports receipt persistence failure after a malformed response', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ results: null }))
    const transport: CollectionRunTransport = async () => {
      throw new Error('failed-run receipt rejected')
    }

    const result = await collectNaverDatalab([THEME], '2026-06-15', '2026-06-19', { transport, reserveAttempt })

    expect(result).toEqual({
      metrics: [],
      report: { requested: 1, succeeded: 0, failed: 1, persistenceFailed: 1 },
    })
  })
})
