import { beforeEach, describe, expect, it, vi } from 'vitest'

const openRows: Array<Record<string, unknown>> = []
const inserted: Array<Record<string, unknown>> = []
const closed: string[] = []

vi.mock('@/scripts/tli/shared/supabase-batch', () => ({
  batchQuery: async () => openRows,
  batchUpsert: async () => 0,
  groupByThemeId: () => new Map(),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: async (rows: Array<Record<string, unknown>>) => { inserted.push(...rows); return { error: null } },
      update: (patch: { superseded_at: string }) => ({
        eq: (_column: string, id: string) => ({
          is: async () => { closed.push(id); void patch; return { error: null } },
        }),
      }),
    }),
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
    closed.length = 0
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
    expect(closed).toEqual(['empty-005930'])
    expect(inserted).toEqual([expect.objectContaining({
      theme_id: 'empty', symbol: '005930', valid_from: '2026-09-01', valid_to: '2026-09-17',
    })])
  })

  it('범위에 없는 테마는 건드리지 않는다 — 게이트 실패를 매핑 제거로 오판하지 않는다', async () => {
    openRows.push(openVersion('failed', '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [{ themeId: 'ok', symbol: '000660', relevance: 1.0, market: 'KOSPI' }],
      observedThemeIds: ['ok'],
      observedDate: '2026-09-17',
    })

    expect(closed).toEqual([])
    expect(result.opened).toBe(1)
  })

  it('범위를 생략하면 종목이 나온 테마로 한정한다 — 이전 동작 유지', async () => {
    openRows.push(openVersion('empty', '005930'))

    await recordThemeStockMembershipHistory({
      observed: [{ themeId: 'ok', symbol: '000660', relevance: 1.0, market: 'KOSPI' }],
      observedDate: '2026-09-17',
    })

    expect(closed).toEqual([])
  })

  it('관측한 테마가 하나도 없으면 아무것도 하지 않는다', async () => {
    openRows.push(openVersion('empty', '005930'))

    const result = await recordThemeStockMembershipHistory({
      observed: [],
      observedThemeIds: [],
      observedDate: '2026-09-17',
    })

    expect(result).toEqual({ opened: 0, closed: 0, appended: 0 })
    expect(closed).toEqual([])
  })
})
