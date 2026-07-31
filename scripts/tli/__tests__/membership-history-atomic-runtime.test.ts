import { beforeEach, describe, expect, it, vi } from 'vitest'

const membershipMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  batchQuery: vi.fn(),
  batchUpsert: vi.fn(),
  planDiff: vi.fn(),
  deactivateEq: vi.fn(),
}))

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: membershipMocks.rpc,
    from: membershipMocks.from,
  },
}))

vi.mock('@/scripts/tli/shared/supabase-batch', () => ({
  batchQuery: membershipMocks.batchQuery,
  batchUpsert: membershipMocks.batchUpsert,
  groupByThemeId: vi.fn(),
}))

vi.mock('@/scripts/tli/themes/theme-membership-history', () => ({
  planMembershipHistoryDiff: membershipMocks.planDiff,
}))

const OPEN = {
  theme_id: '00000000-0000-4000-8000-000000000001',
  symbol: '005930',
  valid_from: '2026-07-10',
  valid_to: null,
  recorded_at: '2026-07-10T00:00:00.000Z',
  source: 'naver',
  collection_run_id: null,
  relevance: 1,
  market: 'KOSPI',
}

const TRANSITION = {
  themeId: OPEN.theme_id,
  symbol: OPEN.symbol,
  close: {
    id: '00000000-0000-4000-8000-000000000099',
    superseded_at: '2026-07-11T00:00:00.000Z',
  },
  replacements: [{
    ...OPEN,
    valid_to: '2026-07-11',
    recorded_at: '2026-07-11T00:00:00.000Z',
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  membershipMocks.batchQuery.mockResolvedValue([])
  membershipMocks.batchUpsert.mockResolvedValue(0)
  membershipMocks.planDiff.mockReturnValue({ opens: [], transitions: [] })
  membershipMocks.rpc.mockResolvedValue({ data: [], error: null })
  membershipMocks.deactivateEq.mockResolvedValue({ error: null })
  membershipMocks.from.mockImplementation(() => ({
    update: vi.fn(() => ({ eq: membershipMocks.deactivateEq })),
  }))
})

describe('membership history transactional persistence', () => {
  it('sends opens and close/replacements through one atomic RPC and verifies counts', async () => {
    membershipMocks.planDiff.mockReturnValue({ opens: [OPEN], transitions: [TRANSITION] })
    membershipMocks.rpc.mockResolvedValue({
      data: [{ opened: 1, closed: 1, appended: 2 }],
      error: null,
    })
    const { recordThemeStockMembershipHistory } = await import('@/scripts/tli/shared/data-ops')

    await expect(recordThemeStockMembershipHistory({
      observed: [{ themeId: OPEN.theme_id, symbol: OPEN.symbol, relevance: 1, market: 'KOSPI' }],
      observedDate: '2026-07-11',
    })).resolves.toEqual({ opened: 1, closed: 1, appended: 2 })

    expect(membershipMocks.rpc).toHaveBeenCalledTimes(1)
    expect(membershipMocks.rpc).toHaveBeenCalledWith(
      'apply_theme_stock_membership_history_diff',
      {
        p_diff: {
          opens: [OPEN],
          transitions: [{
            close_id: TRANSITION.close.id,
            theme_id: TRANSITION.themeId,
            symbol: TRANSITION.symbol,
            superseded_at: TRANSITION.close.superseded_at,
            replacements: TRANSITION.replacements,
          }],
        },
      },
    )
    expect(membershipMocks.from).not.toHaveBeenCalled()
  })

  it('propagates an RPC failure and rejects a missing/mismatched result', async () => {
    membershipMocks.planDiff.mockReturnValue({ opens: [OPEN], transitions: [] })
    const { recordThemeStockMembershipHistory } = await import('@/scripts/tli/shared/data-ops')

    membershipMocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rollback' } })
    await expect(recordThemeStockMembershipHistory({
      observed: [{ themeId: OPEN.theme_id, symbol: OPEN.symbol, relevance: 1, market: 'KOSPI' }],
      observedDate: '2026-07-11',
    })).rejects.toThrow(/transaction 실패: rollback/)

    membershipMocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(recordThemeStockMembershipHistory({
      observed: [{ themeId: OPEN.theme_id, symbol: OPEN.symbol, relevance: 1, market: 'KOSPI' }],
      observedDate: '2026-07-11',
    })).rejects.toThrow(/transaction 결과 불일치/)
  })
})

describe('theme stock cache deactivation', () => {
  it('fails the caller when any current-cache deactivation fails', async () => {
    membershipMocks.batchQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'stock-row-2',
        theme_id: OPEN.theme_id,
        symbol: '000660',
      }])
    membershipMocks.deactivateEq.mockResolvedValue({ error: { message: 'write denied' } })
    const { upsertThemeStocks } = await import('@/scripts/tli/shared/data-ops')

    await expect(upsertThemeStocks([{
      themeId: OPEN.theme_id,
      symbol: OPEN.symbol,
      name: '삼성전자',
      market: 'KOSPI',
      currentPrice: 100,
      priceChangePct: 1,
      volume: 10,
    }], '2026-07-11')).rejects.toThrow(/비활성화 실패.*write denied/)

    expect(membershipMocks.batchQuery).toHaveBeenNthCalledWith(
      2,
      'theme_stocks',
      'id, theme_id, symbol',
      [OPEN.theme_id],
      expect.any(Function),
      'theme_id',
      { failOnError: true, orderBy: { column: 'id' } },
    )
    expect(membershipMocks.deactivateEq).toHaveBeenCalledWith('id', 'stock-row-2')
  })
})
