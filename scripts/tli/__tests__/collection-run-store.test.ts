import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: { rpc: supabaseMocks.rpc },
}))

import { sha256Hex } from '@/lib/tli/canonical-json'
import { getKoreanTradingDatesBetween } from '@/lib/tli/trading-calendar'
import { buildInterestCollectionRun, type InterestObservationInput } from '../collectors/collection-run-contract'
import {
  APPEND_COLLECTION_RUN_RPC,
  appendCollectionRun,
  buildCollectionRunAppendRequest,
  commitSnapshotThenCache,
  type CollectionRunTransport,
} from '../collectors/collection-run-store'

const THEME_A = '11111111-1111-4111-8111-111111111111'
const WINDOW_START = '2026-06-08'
const WINDOW_END = '2026-06-19'
const RUN_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_RUN_ID = '55555555-5555-4555-8555-555555555555'

const tradingDates = getKoreanTradingDatesBetween({ startDate: WINDOW_START, endDate: WINDOW_END })

const observation = (tradingDate: string, rawValue: number): InterestObservationInput => ({
  theme_id: THEME_A,
  trading_date: tradingDate,
  source: 'naver_datalab',
  raw_value: rawValue,
  normalized: rawValue,
  anchor_scaled_value: null,
  keyword_epoch: 1,
})

const buildAppend = () =>
  buildInterestCollectionRun({
    contractVersion: 'tli-interest-v1',
    requestWindowStart: WINDOW_START,
    requestWindowEnd: WINDOW_END,
    requestPayload: { startDate: WINDOW_START, endDate: WINDOW_END, timeUnit: 'date' },
    responsePayload: { results: [{ title: 'a', keywords: ['a'], data: [] }] },
    keywordGroupHash: sha256Hex('kw'),
    requestedThemes: [{ themeId: THEME_A, groupName: 'a' }],
    observations: tradingDates.map((date, index) => observation(date, index + 1)),
    respondedThemeIds: [THEME_A],
    timestamps: {
      requestedAt: '2026-06-19T08:00:00.000Z',
      collectedAt: '2026-06-19T08:00:05.000Z',
      completedAt: '2026-06-19T08:00:06.000Z',
    },
  })

beforeEach(() => {
  supabaseMocks.rpc.mockReset()
})

describe('collection run append request', () => {
  it('run과 observations를 하나의 canonical payload로 묶는다', () => {
    const request = buildCollectionRunAppendRequest(buildAppend())

    expect(request.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(request.payloadSha256).toBe(sha256Hex(request.canonicalJson))
    expect(request.canonicalJson.startsWith('{')).toBe(true)
    expect(request.canonicalJson.endsWith('}')).toBe(true)
    expect(/[\r\n]/.test(request.canonicalJson)).toBe(false)

    const parsed = JSON.parse(request.canonicalJson) as { run: unknown; observations: unknown[] }
    expect(parsed.run).toBeDefined()
    expect(parsed.observations).toHaveLength(tradingDates.length)
  })

  it('같은 fixture를 두 번 만들면 동일한 payload hash를 낸다 (response hash 안정)', () => {
    expect(buildCollectionRunAppendRequest(buildAppend()).payloadSha256).toBe(
      buildCollectionRunAppendRequest(buildAppend()).payloadSha256,
    )
  })

  it('RPC 이름을 046 계약에 맞게 고정한다', () => {
    expect(APPEND_COLLECTION_RUN_RPC).toBe('append_tli_collection_run')
  })

  it('기본 transport가 migration 050의 실제 named parameters만 전달한다', async () => {
    const append = buildAppend()
    const request = buildCollectionRunAppendRequest(append)
    supabaseMocks.rpc.mockResolvedValueOnce({ data: RUN_ID, error: null })

    await expect(appendCollectionRun(append)).resolves.toBe(RUN_ID)
    expect(supabaseMocks.rpc).toHaveBeenCalledWith(APPEND_COLLECTION_RUN_RPC, {
      p_run_canonical_json: request.canonicalJson,
      p_payload_sha256: request.payloadSha256,
    })
  })
})

describe('commitSnapshotThenCache', () => {
  it('snapshot commit 성공 후에만 current cache를 갱신한다', async () => {
    const callOrder: string[] = []
    const transport: CollectionRunTransport = vi.fn(async () => {
      callOrder.push('snapshot')
      return RUN_ID
    })
    const updateCurrentCache = vi.fn(async () => {
      callOrder.push('cache')
    })

    const result = await commitSnapshotThenCache({ append: buildAppend(), updateCurrentCache, transport })

    expect(callOrder).toEqual(['snapshot', 'cache'])
    expect(result).toEqual({ runId: RUN_ID, cacheError: null })
    expect(updateCurrentCache).toHaveBeenCalledWith(RUN_ID)
  })

  it('snapshot transaction 실패 시 cache write가 0이다', async () => {
    const transport: CollectionRunTransport = vi.fn(async () => {
      throw new Error('deferred constraint trigger rejected the run')
    })
    const updateCurrentCache = vi.fn(async () => undefined)

    await expect(commitSnapshotThenCache({ append: buildAppend(), updateCurrentCache, transport })).rejects.toThrow(
      /deferred constraint trigger/,
    )
    expect(updateCurrentCache).not.toHaveBeenCalled()
  })

  it('current cache 실패가 commit된 snapshot을 훼손하지 않는다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const transport: CollectionRunTransport = vi.fn(async () => RUN_ID)
    const updateCurrentCache = vi.fn(async () => {
      throw new Error('interest_metrics upsert 실패')
    })

    const result = await commitSnapshotThenCache({ append: buildAppend(), updateCurrentCache, transport })

    expect(result.runId).toBe(RUN_ID)
    expect(result.cacheError).toMatch(/interest_metrics upsert 실패/)
    expect(transport).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('같은 full fixture를 두 번 수집하면 별도 immutable vintage로 append된다', async () => {
    const transport = vi.fn<CollectionRunTransport>()
      .mockResolvedValueOnce(RUN_ID)
      .mockResolvedValueOnce(SECOND_RUN_ID)
    const updateCurrentCache = vi.fn(async () => undefined)

    const firstResult = await commitSnapshotThenCache({ append: buildAppend(), updateCurrentCache, transport })
    const secondResult = await commitSnapshotThenCache({ append: buildAppend(), updateCurrentCache, transport })

    expect(transport).toHaveBeenCalledTimes(2)
    const [first, second] = transport.mock.calls
    // 동일 response hash·동일 payload지만 upsert/onConflict가 없으므로 DB는 매번 새 immutable run을 만든다.
    expect(first[0].payloadSha256).toBe(second[0].payloadSha256)
    expect([firstResult.runId, secondResult.runId]).toEqual([RUN_ID, SECOND_RUN_ID])
  })
})
