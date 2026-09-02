import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalJsonV1Sha256 } from '@/lib/tli/canonical-json'
import {
  forecastInterestRunWindow,
  resolveThemeKeywordGroup,
} from '../collectors/collection-run-contract'
import {
  callNaverDatalab,
  datalabFailureReason,
  NaverDatalabQuotaError,
  toDatalabRequestPayload,
  toDatalabResponsePayload,
  type NaverDatalabRequest,
  type NaverDatalabResponse,
} from '../collectors/naver-datalab-api'
import {
  DEFAULT_TLI_DATALAB_DAILY_CEILING,
  reserveDatalabQuota,
  resolveDatalabDailyCeiling,
} from '../collectors/naver-datalab-quota'
import {
  isReusableRun,
  loadTodayCompleteDatalabRuns,
  type ReusableDatalabRun,
} from '../collectors/naver-datalab-reuse'
import { collectForecastInterestRuns, collectNaverDatalab } from '../collectors/naver-datalab'
import { withRetry } from '../shared/utils'

const THEME = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'HBM',
  naverKeywords: ['HBM'],
}

const REQUEST: NaverDatalabRequest = {
  startDate: '2026-09-01',
  endDate: '2026-09-01',
  timeUnit: 'date',
  keywordGroups: [{ groupName: 'HBM', keywords: ['HBM'] }],
}

const RESPONSE: NaverDatalabResponse = {
  results: [{
    title: 'HBM',
    keywords: ['HBM'],
    data: [{ period: '2026-09-01', ratio: 42 }],
  }],
}

const originalClientId = process.env.NAVER_CLIENT_ID
const originalClientSecret = process.env.NAVER_CLIENT_SECRET
const originalAnchorEnabled = process.env.TLI_ANCHOR_ENABLED
const originalForceRefresh = process.env.TLI_DATALAB_FORCE_REFRESH

describe('withRetry retry policy', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('throws immediately when shouldRetry returns false', async () => {
    const error = new Error('non-retryable')
    const operation = vi.fn(async () => { throw error })

    await expect(withRetry(operation, 3, 'test', { shouldRetry: () => false }))
      .rejects.toBe(error)
    expect(operation).toHaveBeenCalledOnce()
  })

  it('keeps the default retry behavior', async () => {
    vi.useFakeTimers()
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok')

    const resultPromise = withRetry(operation, 3, 'test')
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(resultPromise).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})

describe('Naver DataLab quota-aware API boundary', () => {
  beforeEach(() => {
    process.env.NAVER_CLIENT_ID = 'id'
    process.env.NAVER_CLIENT_SECRET = 'secret'
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('turns 429 into a non-retryable quota error', async () => {
    const fetchMock = vi.fn(async () => new Response('Query limit exceeded', { status: 429 }))
    const reserveAttempt = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', fetchMock)

    await expect(callNaverDatalab(REQUEST, { reserveAttempt }))
      .rejects.toBeInstanceOf(NaverDatalabQuotaError)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(reserveAttempt).toHaveBeenCalledOnce()
    expect(datalabFailureReason(new NaverDatalabQuotaError('quota')))
      .toBe('naver_datalab_quota_exceeded')
  })

  it('reserves every HTTP attempt, including a retry after 500', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(RESPONSE), { status: 200 }))
    const reserveAttempt = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = callNaverDatalab(REQUEST, { reserveAttempt })
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(resultPromise).resolves.toEqual(RESPONSE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(reserveAttempt).toHaveBeenCalledTimes(2)
  })

  it('reserves exactly once for a successful first attempt', async () => {
    const reserveAttempt = vi.fn(async () => undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RESPONSE), { status: 200 })))

    await expect(callNaverDatalab(REQUEST, { reserveAttempt })).resolves.toEqual(RESPONSE)
    expect(reserveAttempt).toHaveBeenCalledOnce()
  })
})

describe('shared DataLab quota ledger client', () => {
  it('uses the default for a missing or invalid ceiling and warns on invalid input', () => {
    const warn = vi.fn()
    expect(resolveDatalabDailyCeiling(undefined, warn)).toBe(DEFAULT_TLI_DATALAB_DAILY_CEILING)
    expect(resolveDatalabDailyCeiling('901', warn)).toBe(901)
    expect(resolveDatalabDailyCeiling('0', warn)).toBe(DEFAULT_TLI_DATALAB_DAILY_CEILING)
    expect(resolveDatalabDailyCeiling('9.5', warn)).toBe(DEFAULT_TLI_DATALAB_DAILY_CEILING)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('throws a typed quota error when the atomic reservation is denied', async () => {
    const transport = vi.fn(async () => ({ granted: false, attempts: 900, ceiling: 900 }))

    await expect(reserveDatalabQuota({
      kstDate: '2026-09-02',
      count: 1,
      ceiling: 900,
      transport,
    })).rejects.toMatchObject({ reason: 'naver_datalab_quota_exceeded' })
  })
})

describe('same-day DataLab run reuse', () => {
  const reusable = (sourceMaxDate: string | null): ReusableDatalabRun => ({
    id: '44444444-4444-4444-8444-444444444444',
    source_max_date: sourceMaxDate,
    response_payload: toDatalabResponsePayload(RESPONSE),
  })

  beforeEach(() => {
    process.env.TLI_ANCHOR_ENABLED = 'false'
    delete process.env.TLI_DATALAB_FORCE_REFRESH
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses min(request window end, previous trading date) as the freshness floor', () => {
    expect(isReusableRun(reusable('2026-09-01'), {
      requestWindowEnd: '2026-09-01',
      previousTradingDate: '2026-09-01',
    })).toBe(true)
    expect(isReusableRun(reusable('2026-09-01'), {
      requestWindowEnd: '2026-09-02',
      previousTradingDate: '2026-09-01',
    })).toBe(true)
    expect(isReusableRun(reusable('2026-08-31'), {
      requestWindowEnd: '2026-09-02',
      previousTradingDate: '2026-09-01',
    })).toBe(false)
    expect(isReusableRun(reusable(null), {
      requestWindowEnd: '2026-09-02',
      previousTradingDate: '2026-09-01',
    })).toBe(false)
  })

  it('loads only rows completed since KST midnight and keeps the latest row per hash', async () => {
    const transport = vi.fn(async ({ completedAfter }: { completedAfter: string }) => {
      expect(completedAfter).toBe('2026-09-02T00:00:00+09:00')
      return [{
        request_sha256: 'abc',
        id: 'older',
        source_max_date: '2026-08-31',
        response_payload: toDatalabResponsePayload(RESPONSE),
        completed_at: '2026-09-02T00:01:00+09:00',
      }, {
        request_sha256: 'abc',
        id: 'latest',
        source_max_date: '2026-09-01',
        response_payload: toDatalabResponsePayload(RESPONSE),
        completed_at: '2026-09-02T00:02:00+09:00',
      }]
    })

    const runs = await loadTodayCompleteDatalabRuns({ kstDate: '2026-09-02', transport })
    expect(runs.get('abc')?.id).toBe('latest')
  })

  it('combines every keyset page when more than 1,000 runs completed today', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({
      request_sha256: `sha-${index}`,
      id: `run-${String(index).padStart(4, '0')}`,
      source_max_date: '2026-09-01',
      response_payload: toDatalabResponsePayload(RESPONSE),
      completed_at: new Date(Date.parse('2026-09-01T15:00:00.000Z') + index).toISOString(),
    }))
    const transport = vi.fn()
      .mockResolvedValueOnce(rows.slice(0, 1_000))
      .mockResolvedValueOnce(rows.slice(1_000))

    const runs = await loadTodayCompleteDatalabRuns({ kstDate: '2026-09-02', transport })

    expect(runs.size).toBe(1_001)
    expect(runs.get('sha-0')?.id).toBe('run-0000')
    expect(runs.get('sha-1000')?.id).toBe('run-1000')
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0]?.[0]).toEqual({
      completedAfter: '2026-09-02T00:00:00+09:00',
      after: null,
      pageSize: 1_000,
    })
    expect(transport.mock.calls[1]?.[0]).toEqual({
      completedAfter: '2026-09-02T00:00:00+09:00',
      after: {
        first: rows[999].completed_at,
        second: rows[999].id,
        third: rows[999].id,
      },
      pageSize: 1_000,
    })
  })

  it('reuses a batch response without API or append and returns identical cache metrics', async () => {
    const freshApi = vi.fn(async () => RESPONSE)
    const freshTransport = vi.fn(async () => 'fresh-run')
    const fresh = await collectNaverDatalab([THEME], REQUEST.startDate, REQUEST.endDate, {
      forceRefresh: true,
      callDatalab: freshApi,
      transport: freshTransport,
    })

    const requestSha256 = canonicalJsonV1Sha256(toDatalabRequestPayload(REQUEST))
    const reuseApi = vi.fn(async () => { throw new Error('must not call API') })
    const reuseTransport = vi.fn(async () => 'must-not-append')
    const reused = await collectNaverDatalab([THEME], REQUEST.startDate, REQUEST.endDate, {
      reuseRuns: new Map([[requestSha256, reusable('2026-09-01')]]),
      previousTradingDate: '2026-08-31',
      callDatalab: reuseApi,
      transport: reuseTransport,
    })

    expect(reused.metrics).toEqual(fresh.metrics)
    expect(reused.report).toEqual({
      requested: 0,
      reused: 1,
      succeeded: 0,
      failed: 0,
      persistenceFailed: 0,
    })
    expect(reuseApi).not.toHaveBeenCalled()
    expect(reuseTransport).not.toHaveBeenCalled()
  })

  it('disables reuse when TLI_DATALAB_FORCE_REFRESH is true', async () => {
    process.env.TLI_DATALAB_FORCE_REFRESH = 'true'
    const requestSha256 = canonicalJsonV1Sha256(toDatalabRequestPayload(REQUEST))
    const api = vi.fn(async () => RESPONSE)
    const transport = vi.fn(async () => 'fresh-run')

    const result = await collectNaverDatalab([THEME], REQUEST.startDate, REQUEST.endDate, {
      reuseRuns: new Map([[requestSha256, reusable('2026-09-01')]]),
      previousTradingDate: '2026-08-31',
      callDatalab: api,
      transport,
    })

    expect(result.report).toEqual({ requested: 1, succeeded: 1, failed: 0, persistenceFailed: 0 })
    expect(api).toHaveBeenCalledOnce()
    expect(transport).toHaveBeenCalledOnce()
  })

  it('reuses a forecast-interest response without API or append', async () => {
    const window = forecastInterestRunWindow('2026-09-02')
    const spec = resolveThemeKeywordGroup(THEME)
    const request: NaverDatalabRequest = {
      startDate: window.startDate,
      endDate: window.endDate,
      timeUnit: 'date',
      keywordGroups: [{ groupName: spec.group_name, keywords: [...spec.keywords] }],
    }
    const response: NaverDatalabResponse = {
      results: [{
        title: spec.group_name,
        keywords: [...spec.keywords],
        data: window.tradingDates.map((period, index) => ({ period, ratio: index + 1 })),
      }],
    }
    const run: ReusableDatalabRun = {
      id: 'forecast-run',
      source_max_date: window.endDate,
      response_payload: toDatalabResponsePayload(response),
    }
    const api = vi.fn(async () => { throw new Error('must not call API') })
    const transport = vi.fn(async () => 'must-not-append')

    const report = await collectForecastInterestRuns([THEME], '2026-09-02', {
      reuseRuns: new Map([[
        canonicalJsonV1Sha256(toDatalabRequestPayload(request)),
        run,
      ]]),
      previousTradingDate: window.endDate,
      callDatalab: api,
      transport,
    })

    expect(report).toEqual({
      requested: 0,
      reused: 1,
      succeeded: 0,
      failed: 0,
      persistenceFailed: 0,
    })
    expect(api).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })
})

afterEach(() => {
  if (originalClientId === undefined) delete process.env.NAVER_CLIENT_ID
  else process.env.NAVER_CLIENT_ID = originalClientId
  if (originalClientSecret === undefined) delete process.env.NAVER_CLIENT_SECRET
  else process.env.NAVER_CLIENT_SECRET = originalClientSecret
  if (originalAnchorEnabled === undefined) delete process.env.TLI_ANCHOR_ENABLED
  else process.env.TLI_ANCHOR_ENABLED = originalAnchorEnabled
  if (originalForceRefresh === undefined) delete process.env.TLI_DATALAB_FORCE_REFRESH
  else process.env.TLI_DATALAB_FORCE_REFRESH = originalForceRefresh
})
