import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalJsonV1 } from '@/lib/tli/canonical-json'
import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import { collectForecastInterestRuns, collectNaverDatalab } from '../collectors/naver-datalab'
import { collectNaverNews } from '../collectors/naver-news'
import { collectBablPhaseSnapshot, type AttentionStudyContract } from '../collectors/babl-phase-snapshot'
import {
  forecastInterestRunWindow,
  keywordGroupSha256,
  resolveThemeKeywordGroup,
  type ProdPhaseSnapshot,
} from '../collectors/collection-run-contract'
import type { CollectionRunAppendRequest, CollectionRunTransport } from '../collectors/collection-run-store'

const THEME_A = '11111111-1111-4111-8111-111111111111'
const THEME_B = '22222222-2222-4222-8222-222222222222'
const RUN_ID = '44444444-4444-4444-8444-444444444444'

const BASE_DATE = '2026-06-22'
const NEWS_START = '2026-06-08'
const NEWS_END = '2026-06-22'
const reserveAttempt = async () => undefined

interface ParsedAppend {
  readonly run: Record<string, unknown>
  readonly observations: Array<Record<string, unknown>>
}

const parse = (request: CollectionRunAppendRequest): ParsedAppend =>
  JSON.parse(request.canonicalJson) as ParsedAppend

const makeTransport = () => {
  const calls: CollectionRunAppendRequest[] = []
  const transport: CollectionRunTransport = async (request) => {
    calls.push(request)
    return RUN_ID
  }
  return { transport, calls }
}

const datalabPoints = (dates: readonly string[]) =>
  dates.map((date, index) => ({ period: date, ratio: index + 1 }))

const mockFetchJson = (payload: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }))

describe('DataLab collector → immutable snapshot 배선', () => {
  const window = forecastInterestRunWindow(BASE_DATE)

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

  it('배치 API call마다 별도 immutable run을 append하고 성공한 배치만 cache metric으로 반환한다', async () => {
    const dates = getKoreanTradingDatesBetween({ startDate: '2026-06-15', endDate: '2026-06-19' })
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{ title: 'A', keywords: ['a'], data: datalabPoints(dates) }],
    }))

    const { transport, calls } = makeTransport()
    const result = await collectNaverDatalab(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      '2026-06-15',
      '2026-06-19',
      { transport, reserveAttempt },
    )

    expect(calls).toHaveLength(1)
    const { run, observations } = parse(calls[0])
    expect(run.source).toBe('naver_datalab')
    expect(run.status).toBe('complete')
    expect(observations).toHaveLength(dates.length)
    expect(result.metrics).toHaveLength(dates.length)
    expect(result.report).toEqual({ requested: 1, succeeded: 1, failed: 0, persistenceFailed: 0 })
  })

  it('같은 API fixture를 두 번 수집하면 같은 response hash로 별도 run을 append한다 (overwrite 0)', async () => {
    const dates = getKoreanTradingDatesBetween({ startDate: '2026-06-15', endDate: '2026-06-19' })
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{ title: 'A', keywords: ['a'], data: datalabPoints(dates) }],
    }))

    const { transport, calls } = makeTransport()
    const themes = [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }]
    await collectNaverDatalab(themes, '2026-06-15', '2026-06-19', { transport, reserveAttempt })
    await collectNaverDatalab(themes, '2026-06-15', '2026-06-19', { transport, reserveAttempt })

    expect(calls).toHaveLength(2)
    const first = parse(calls[0]).run
    const second = parse(calls[1]).run
    expect(first.response_sha256).toBe(second.response_sha256)
    expect(first.request_sha256).toBe(second.request_sha256)
    expect(first.expected_keys_sha256).toBe(second.expected_keys_sha256)
  })

  it('snapshot transaction 실패 시 그 배치의 cache metric이 0이다', async () => {
    const dates = getKoreanTradingDatesBetween({ startDate: '2026-06-15', endDate: '2026-06-19' })
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{ title: 'A', keywords: ['a'], data: datalabPoints(dates) }],
    }))

    const transport: CollectionRunTransport = async () => {
      throw new Error('deferred constraint trigger rejected the run')
    }

    const result = await collectNaverDatalab(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      '2026-06-15',
      '2026-06-19',
      { transport, reserveAttempt },
    )

    expect(result.metrics).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 1 })
  })

  it('응답에 없는 테마가 있으면 partial run으로 기록한다 (complete 위장 금지)', async () => {
    const dates = getKoreanTradingDatesBetween({ startDate: '2026-06-15', endDate: '2026-06-19' })
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{ title: 'A', keywords: ['a'], data: datalabPoints(dates) }],
    }))

    const { transport, calls } = makeTransport()
    await collectNaverDatalab(
      [
        { id: THEME_A, name: 'A', naverKeywords: ['a'] },
        { id: THEME_B, name: 'B', naverKeywords: ['b'] },
      ],
      '2026-06-15',
      '2026-06-19',
      { transport, reserveAttempt },
    )

    const { run } = parse(calls[0])
    expect(run.status).toBe('partial')
    expect((run.failure_summary as Record<string, unknown>).missing_theme_ids).toEqual([THEME_B])
  })

  it('API 예외는 failed run으로 남기고 cache에 반영하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))

    const { transport, calls } = makeTransport()
    const result = await collectNaverDatalab(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      '2026-06-15',
      '2026-06-19',
      { transport, reserveAttempt },
    )

    expect(result.metrics).toEqual([])
    expect(result.report).toEqual({ requested: 1, succeeded: 0, failed: 1, persistenceFailed: 0 })
    expect(calls).toHaveLength(1)
    const { run, observations } = parse(calls[0])
    expect(run.status).toBe('failed')
    expect(run.response_sha256).toBeNull()
    expect(observations).toHaveLength(0)
  })

  it('forecast interest run은 테마 dedicated single-group run이고 keyword_group_hash가 테마 hash와 같다', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      results: [{ title: 'A', keywords: ['a'], data: datalabPoints(window.tradingDates) }],
    }))

    const { transport, calls } = makeTransport()
    const report = await collectForecastInterestRuns(
      [{ id: THEME_A, name: 'A', naverKeywords: ['a'] }],
      BASE_DATE,
      { transport, reserveAttempt },
    )

    expect(report).toEqual({ requested: 1, succeeded: 1, failed: 0, persistenceFailed: 0 })
    const { run, observations } = parse(calls[0])
    expect(run.keyword_group_hash).toBe(
      keywordGroupSha256(resolveThemeKeywordGroup({ name: 'A', naverKeywords: ['a'] })),
    )
    expect(run.request_window_start).toBe(window.startDate)
    expect(run.request_window_end).toBe(window.endDate)
    // 046은 window 안 origin_date 이하 관측이 정확히 20개일 것을 요구한다.
    expect(observations).toHaveLength(20)
    expect(run.source_max_date).toBe(window.endDate)
  })
})

describe('news collector → explicit zero row 배선', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'id'
    process.env.NAVER_CLIENT_SECRET = 'secret'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('expected theme×date마다 0건도 명시적 row로 저장하고 cache는 관측 날짜만 유지한다', async () => {
    vi.stubGlobal('fetch', mockFetchJson({
      total: 1,
      items: [{ title: 'HBM 신고가', link: 'https://x.com/1', originallink: 'https://x.com/1', description: '', pubDate: 'Wed, 10 Jun 2026 09:00:00 +0900' }],
    }))

    const { transport, calls } = makeTransport()
    const result = await collectNaverNews(
      [{ id: THEME_A, name: 'HBM', naverKeywords: ['HBM'] }],
      NEWS_START,
      NEWS_END,
      { transport },
    )

    expect(calls).toHaveLength(1)
    const { run, observations } = parse(calls[0])
    expect(run.source).toBe('naver_news')
    expect(run.status).toBe('complete')
    expect(observations).toHaveLength(15)
    expect(observations.filter((o) => o.article_count === 0)).toHaveLength(14)

    // current cache 경로는 기존 계약(관측 날짜만)을 유지한다.
    expect(result.metrics).toHaveLength(1)
    expect(result.metrics[0].articleCount).toBe(1)
  })

  it('news query_hash가 interest keyword_group_sha256와 동일하다 (046 계약)', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ total: 0, items: [] }))

    const { transport, calls } = makeTransport()
    await collectNaverNews([{ id: THEME_A, name: 'HBM', naverKeywords: ['HBM'] }], NEWS_START, NEWS_END, { transport })

    const expected = keywordGroupSha256(resolveThemeKeywordGroup({ name: 'HBM', naverKeywords: ['HBM'] }))
    const { run, observations } = parse(calls[0])
    expect(run.keyword_group_hash).toBe(expected)
    expect(observations.every((o) => o.query_hash === expected)).toBe(true)
  })

  it('검색 실패는 missing(failed run, observation 0)이고 0건으로 위장하지 않으며 cache write가 0이다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))

    const { transport, calls } = makeTransport()
    const result = await collectNaverNews(
      [{ id: THEME_A, name: 'HBM', naverKeywords: ['HBM'] }],
      NEWS_START,
      NEWS_END,
      { transport },
    )

    const { run, observations } = parse(calls[0])
    expect(run.status).toBe('failed')
    expect(observations).toHaveLength(0)
    expect(run.expected_row_count).toBe(15)
    expect(result.metrics).toEqual([])
  })

  it('snapshot append 실패 테마는 cache metric으로 전파되지 않는다', async () => {
    vi.stubGlobal('fetch', mockFetchJson({ total: 0, items: [] }))

    const transport: CollectionRunTransport = async () => {
      throw new Error('snapshot rejected')
    }
    const result = await collectNaverNews(
      [{ id: THEME_A, name: 'HBM', naverKeywords: ['HBM'] }],
      NEWS_START,
      NEWS_END,
      { transport },
    )

    expect(result.metrics).toEqual([])
  })
})

describe('B-Abl collector provenance', () => {
  const study: AttentionStudyContract = {
    id: '99999999-9999-4999-8999-999999999999',
    locked_at: '2026-06-01T00:00:00.000Z',
    first_origin_date: '2026-06-08',
    babl_algorithm_version: 'v4.1',
    babl_comparison_spec_version: 'comparison-v4-spec-v1',
    babl_evaluation_horizon_days: 14,
  }

  const snapshot = (overrides: Partial<ProdPhaseSnapshot> = {}): ProdPhaseSnapshot => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    theme_id: THEME_A,
    snapshot_date: '2026-06-22',
    phase: 'rising',
    algorithm_version: 'v4.1',
    candidate_pool: 'peer',
    comparison_spec_version: 'comparison-v4-spec-v1',
    evaluation_horizon_days: 14,
    created_at: '2026-06-22T07:00:00.000Z',
    ...overrides,
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('study lock이 없으면 아무것도 쓰지 않는다 (fail-closed)', async () => {
    const { transport, calls } = makeTransport()
    const report = await collectBablPhaseSnapshot(BASE_DATE, {
      transport,
      loadStudyContracts: async () => [],
      loadSnapshots: async () => [],
    })

    expect(report.skippedReason).toBe('no_study_contract')
    expect(calls).toHaveLength(0)
  })

  it('pool은 source prod run 값을 그대로 쓰고 study lock tuple만 필터한다', async () => {
    const { transport, calls } = makeTransport()
    const loadSnapshots = vi.fn<(
      input: {
        readonly snapshotDate: string
        readonly study: AttentionStudyContract
      },
    ) => Promise<ProdPhaseSnapshot[]>>(async () => [snapshot()])

    const report = await collectBablPhaseSnapshot('2026-06-22', {
      transport,
      loadStudyContracts: async () => [study],
      loadSnapshots,
    })

    expect(report.observations).toBe(1)
    const { run, observations } = parse(calls[0])
    expect(run.source).toBe('babl_phase')
    expect(run.status).toBe('complete')
    expect(observations[0].candidate_pool).toBe('peer')
    expect(observations[0].source_prediction_snapshot_id).toBe(snapshot().id)

    // loader에 candidate_pool 필터를 넘기지 않는다 — pool 선택은 source prod run의 몫이다.
    const passed = loadSnapshots.mock.calls.at(0)?.[0]
    expect(passed?.study).toEqual(study)
    // request payload는 study lock tuple만 담고 candidate_pool을 지정하지 않는다.
    const requestPayload = run.request_payload as Record<string, unknown>
    expect(requestPayload.candidate_pool).toBeUndefined()
    expect(requestPayload.babl_algorithm_version).toBe('v4.1')
    expect(canonicalJsonV1(requestPayload)).not.toContain('candidate_pool')
  })

  it('study lock과 다른 tuple의 prod 스냅샷은 observation이 되지 않는다', async () => {
    const { transport, calls } = makeTransport()
    await collectBablPhaseSnapshot('2026-06-22', {
      transport,
      loadStudyContracts: async () => [study],
      loadSnapshots: async () => [snapshot({ algorithm_version: 'v4.2' })],
    })

    const { observations } = parse(calls[0])
    expect(observations).toHaveLength(0)
  })
})
