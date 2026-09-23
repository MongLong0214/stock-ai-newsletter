import { beforeEach, describe, expect, it, vi } from 'vitest'

const openRows: Array<Record<string, unknown>> = []
const inserted: Array<Record<string, unknown>> = []
const rpc = vi.fn(async (
  _name: string,
  args: { p_transitions: Array<{ replacements: unknown[] }> },
): Promise<{ data: { closed: number; appended: number } | null; error: { message: string } | null }> => ({
  data: {
    closed: args.p_transitions.length,
    appended: args.p_transitions.reduce((count, transition) => count + transition.replacements.length, 0),
  },
  error: null,
}))

vi.mock('@/scripts/tli/shared/supabase-batch', () => ({
  batchQuery: async () => openRows,
  batchUpsert: async () => 0,
  groupByThemeId: () => new Map(),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: async (rows: Array<Record<string, unknown>>) => { inserted.push(...rows); return { error: null } },
    }),
    rpc: (name: string, args: { p_transitions: Array<{ replacements: unknown[] }> }) => rpc(name, args),
  },
}))

import { recordThemeStockMembershipHistory } from '@/scripts/tli/shared/data-ops'

const openVersion = (themeId: string, symbol: string) => ({
  id: `${themeId}-${symbol}`,
  theme_id: themeId,
  symbol,
  valid_from: '2026-09-01',
  valid_to: null,
  recorded_at: '2026-09-01T00:00:00.000Z',
  superseded_at: null,
  source: 'naver',
  collection_run_id: null,
  relevance: 1.0,
  market: 'KOSPI',
})

/**
 * 2026-09-17 회귀.
 *
 * diff 범위를 관측된 **종목**에서 역산하면, 네이버가 "종목 0개"라고 답한 테마가 범위에서
 * 빠진다. 그 테마의 열린 version은 영원히 안 닫히고 as-of 질의가 "지금도 구성종목"이라고
 * 답한다 — 이력 테이블이 해소하려던 바스켓 survivorship이 이력 테이블 안에서 재발한다.
 *
 * 동시에 게이트 실패로 결과를 모르는 테마는 절대 범위에 넣으면 안 된다. 넣으면 관측하지
 * 않은 membership 종료를 조작하게 된다.
 */
describe('recordThemeStockMembershipHistory 관측 범위', () => {
  beforeEach(() => {
    openRows.length = 0
    inserted.length = 0
    rpc.mockClear()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  it('네이버가 0개라고 답한 테마의 열린 version을 닫는다', async () => {
    openRows.push(openVersion('empty', '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: ['empty'],
      observedDate: '2026-09-17',
    })

    expect(result.closed).toBe(1)
    expect(rpc).toHaveBeenCalledWith('apply_theme_stock_membership_transitions', {
      p_transitions: [expect.objectContaining({
        close: expect.objectContaining({ id: 'empty-005930' }),
        replacements: [expect.objectContaining({
          theme_id: 'empty', symbol: '005930', valid_from: '2026-09-01', valid_to: '2026-09-17',
        })],
      })],
    })
    expect(inserted).toEqual([])
  })

  it('범위에 없는 테마는 건드리지 않는다 — 게이트 실패를 매핑 제거로 오판하지 않는다', async () => {
    openRows.push(openVersion('failed', '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [{ themeId: 'ok', symbol: '000660', relevance: 1.0, market: 'KOSPI' }],
      observedThemeIds: ['ok'],
      observedDate: '2026-09-17',
    })

    expect(rpc).not.toHaveBeenCalled()
    expect(result.opened).toBe(1)
  })

  it('범위를 생략하면 종목이 나온 테마로 한정한다 — 이전 동작 유지', async () => {
    openRows.push(openVersion('empty', '005930'))

    await recordThemeStockMembershipHistory({
      observed: [{ themeId: 'ok', symbol: '000660', relevance: 1.0, market: 'KOSPI' }],
      observedDate: '2026-09-17',
    })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('관측한 테마가 하나도 없으면 아무것도 하지 않는다', async () => {
    openRows.push(openVersion('empty', '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: [],
      observedDate: '2026-09-17',
    })

    expect(result).toEqual({ opened: 0, closed: 0, appended: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('전이 201개를 200개와 1개 RPC 청크로 나눈다', async () => {
    for (let i = 0; i < 201; i += 1) openRows.push(openVersion(`theme-${i}`, '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: openRows.map(row => row.theme_id as string),
      observedDate: '2026-09-17',
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]?.[1].p_transitions).toHaveLength(200)
    expect(rpc.mock.calls[1]?.[1].p_transitions).toHaveLength(1)
    expect(result).toEqual({ opened: 0, closed: 201, appended: 201 })
  })

  it('RPC 오류를 청크 범위와 함께 즉시 throw한다', async () => {
    openRows.push(openVersion('empty', '005930'))
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'insert rejected' } })

    await expect(recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: ['empty'],
      observedDate: '2026-09-17',
    })).rejects.toThrow('membership transition RPC 실패 (1~1): insert rejected')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each([
    { closed: 0, appended: 1 },
    { closed: 1, appended: 0 },
  ])('RPC 반환 행수가 다르면 throw한다: %j', async (data) => {
    openRows.push(openVersion('empty', '005930'))
    rpc.mockResolvedValueOnce({ data, error: null })

    await expect(recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: ['empty'],
      observedDate: '2026-09-17',
    })).rejects.toThrow('membership transition RPC 행수 불일치 (1~1)')
  })

  it('같은 날 제거로 replacement가 비면 close-only 전이가 성공한다', async () => {
    openRows.push({ ...openVersion('empty', '005930'), valid_from: '2026-09-17' })

    const result = await recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: ['empty'],
      observedDate: '2026-09-17',
    })

    expect(result).toEqual({ opened: 0, closed: 1, appended: 0 })
    expect(rpc).toHaveBeenCalledWith('apply_theme_stock_membership_transitions', {
      p_transitions: [expect.objectContaining({
        close: expect.objectContaining({ id: 'empty-005930' }),
        replacements: [],
      })],
    })
    expect(inserted).toEqual([])
  })
})
