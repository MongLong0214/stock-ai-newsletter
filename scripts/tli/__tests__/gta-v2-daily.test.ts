import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  manifests: [] as unknown[],
  children: [] as unknown[],
  range: vi.fn(),
  createGtAV2PendingLabels: vi.fn(),
}))

vi.mock('../shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const rows = table === 'tli_forecast_origin_manifests' ? mocks.manifests : mocks.children
      const result = Promise.resolve({ data: rows.slice(0, 1000), error: null })
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        lte: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(async (from: number, to: number) => {
          mocks.range(table, from, to)
          return { data: rows.slice(from, to + 1), error: null }
        }),
        limit: vi.fn(async () => ({ data: [], error: null })),
        then: result.then.bind(result),
      }
      return query
    }),
  },
}))

vi.mock('../labels/finalize-gt-a-v2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../labels/finalize-gt-a-v2')>()
  return { ...actual, createGtAV2PendingLabels: mocks.createGtAV2PendingLabels }
})

import { deriveGtAV2Windows, loadKospiTradingDates, runGtAV2FoundationPhase } from '../labels/gta-v2-daily'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.manifests.length = 0
  mocks.children.length = 0
  mocks.createGtAV2PendingLabels.mockImplementation(async ({ themeIds }: { themeIds: string[] }) => themeIds.length)
})

// 2026-07 KOSPI 실측: 7/17(제헌절 재지정)·주말 휴장이 반영된 거래일 시퀀스.
const KOSPI_DATES = [
  '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
  '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
  '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
]

describe('loadKospiTradingDates', () => {
  it('1,001행을 keyset 2페이지로 합쳐 오름차순·중복 없이 반환한다', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => ({
      trade_date: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    }))
    const transport = vi.fn()
      .mockResolvedValueOnce(rows.slice(0, 1_000))
      .mockResolvedValueOnce(rows.slice(1_000))

    const dates = await loadKospiTradingDates(transport)

    expect(dates).toEqual(rows.map((row) => row.trade_date))
    expect(new Set(dates).size).toBe(1_001)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0]?.[0]).toEqual({ after: null, pageSize: 1_000 })
    expect(transport.mock.calls[1]?.[0]).toEqual({
      after: {
        first: rows[999].trade_date,
        second: rows[999].trade_date,
        third: rows[999].trade_date,
      },
      pageSize: 1_000,
    })
  })
})

describe('runGtAV2FoundationPhase pagination', () => {
  it('creates foundation labels for manifests after the first 1,000 rows', async () => {
    mocks.manifests.push(...Array.from({ length: 1001 }, (_, index) => ({
      id: `manifest-${String(index).padStart(4, '0')}`, origin_date: '2026-07-20',
    })))
    mocks.children.push({ theme_id: 'theme-1', input_status: 'abstain', keyword_group_sha256: 'a'.repeat(64), forecast_interest_run_id: null })

    const result = await runGtAV2FoundationPhase('2026-07-27')

    expect(result.pendingCreated).toBe(1001)
    expect(mocks.createGtAV2PendingLabels).toHaveBeenLastCalledWith({
      baseDate: '2026-07-20', forecastOriginManifestId: 'manifest-1000', themeIds: ['theme-1'],
    })
    expect(mocks.range.mock.calls.filter(([table]) => table === 'tli_forecast_origin_manifests')).toEqual([
      ['tli_forecast_origin_manifests', 0, 999],
      ['tli_forecast_origin_manifests', 1000, 1999],
    ])
  })

  it('creates foundation labels for every child when a manifest has more than 1,000 themes', async () => {
    mocks.manifests.push({ id: 'manifest-1', origin_date: '2026-07-20' })
    const children = Array.from({ length: 1001 }, (_, index) => ({
      theme_id: `theme-${String(index).padStart(4, '0')}`, input_status: 'abstain',
      keyword_group_sha256: 'a'.repeat(64), forecast_interest_run_id: null,
    }))
    mocks.children.push(...children)

    const result = await runGtAV2FoundationPhase('2026-07-27')

    expect(result.pendingCreated).toBe(1001)
    expect(mocks.createGtAV2PendingLabels).toHaveBeenCalledWith({
      baseDate: '2026-07-20', forecastOriginManifestId: 'manifest-1',
      themeIds: children.map((child) => child.theme_id),
    })
    expect(mocks.range.mock.calls.filter(([table]) => table === 'tli_forecast_origin_theme_inputs')).toEqual([
      ['tli_forecast_origin_theme_inputs', 0, 999],
      ['tli_forecast_origin_theme_inputs', 1000, 1999],
    ])
  })
})

describe('deriveGtAV2Windows', () => {
  it('base 포함 직전 5 + 이후 5 거래일을 KOSPI 실측에서 파생한다 (7/17 휴장 반영)', () => {
    const windows = deriveGtAV2Windows(KOSPI_DATES, '2026-07-20')

    expect(windows?.pastDates).toEqual(['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-20'])
    expect(windows?.futureDates).toEqual(['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-27'])
    expect(windows?.horizonDate).toBe('2026-07-27')
    // grace = horizon 뒤 3번째 거래일(7/30) 18:00 KST
    expect(windows?.graceDeadline?.toISOString()).toBe(new Date('2026-07-30T18:00:00+09:00').toISOString())
  })

  it('미래 창이 5 거래일 미만이면 null (KOSPI 실측 미성숙 — RPC와 동일하게 pending 유지)', () => {
    expect(deriveGtAV2Windows(KOSPI_DATES.slice(0, 12), '2026-07-20')).toBeNull()
  })

  it('base_date가 거래일이 아니면 null (past 마지막 slot이 base와 불일치)', () => {
    expect(deriveGtAV2Windows(KOSPI_DATES, '2026-07-19')).toBeNull()
  })

  it('grace 3번째 거래일이 아직 없으면 graceDeadline은 null이다', () => {
    const windows = deriveGtAV2Windows(KOSPI_DATES.slice(0, 16), '2026-07-20')
    expect(windows?.futureDates).toHaveLength(5)
    expect(windows?.graceDeadline).toBeNull()
  })
})
