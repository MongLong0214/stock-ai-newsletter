import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseAdminMocks = vi.hoisted(() => {
  const pages: Array<{ readonly data: unknown; readonly error: unknown }> = []
  const eq = vi.fn()
  const order = vi.fn()
  return { eq, order, pages }
})

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: supabaseAdminMocks.eq,
        lte: vi.fn(() => query),
        order: supabaseAdminMocks.order,
        range: vi.fn(async () => supabaseAdminMocks.pages.shift() ?? { data: [], error: null }),
      }
      supabaseAdminMocks.eq.mockImplementation(() => query)
      supabaseAdminMocks.order.mockImplementation(() => query)
      return query
    }),
  },
}))

import {
  countExpiredPendingLabels,
  getDailyLabelBaseDates,
  loadPendingBaseDates,
  runDailyLabelPhase,
} from '../labels/daily-label-phase'

const emptyGtAResult = {
  baseDate: '2026-07-01',
  totalThemes: 1,
  pendingCount: 0,
  finalCount: 1,
  censoredCount: 0,
  excludedCount: 0,
}

const emptyGtBResult = {
  baseDate: '2026-07-01',
  totalThemes: 1,
  finalCount: 1,
  pendingCount: 0,
  excludedCount: 0,
  coverageRate: 1,
}

describe('daily label phase', () => {
  beforeEach(() => {
    supabaseAdminMocks.eq.mockClear()
    supabaseAdminMocks.order.mockClear()
    supabaseAdminMocks.pages.length = 0
  })

  it('uses the current trading day for pending labels and t-5 for finalization cutoff', () => {
    expect(getDailyLabelBaseDates('2026-07-10')).toEqual({
      pendingBaseDate: '2026-07-10',
      finalizeCutoffDate: '2026-07-03',
    })
  })

  it('runs pending GT-A, retroactively finalizes GT-A/GT-B at the cutoff, and closes non-trading pending', async () => {
    const generateGtA = vi.fn()
      .mockResolvedValueOnce({ ...emptyGtAResult, baseDate: '2026-07-10', pendingCount: 1, finalCount: 0 })
      .mockResolvedValueOnce({ ...emptyGtAResult, baseDate: '2026-07-03' })
    const generateGtB = vi.fn().mockResolvedValue({ ...emptyGtBResult, baseDate: '2026-07-03' })
    const loadPendingBaseDates = vi.fn().mockResolvedValue([])
    const closeNonTradingPending = vi.fn().mockResolvedValue(0)
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-10', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates,
      closeNonTradingPending,
      warn,
    })

    expect(generateGtA).toHaveBeenNthCalledWith(1, { baseDate: '2026-07-10', today: '2026-07-10' })
    expect(generateGtA).toHaveBeenNthCalledWith(2, {
      baseDate: '2026-07-03',
      includeInactive: true,
      missingOrPendingOnly: true,
      today: '2026-07-10',
    })
    expect(generateGtB).toHaveBeenCalledWith('2026-07-03', { missingOrPendingOnly: true })
    expect(loadPendingBaseDates).toHaveBeenCalledWith({ labelType: 'gt_a', cutoffDate: '2026-07-03' })
    expect(loadPendingBaseDates).toHaveBeenCalledWith({ labelType: 'gt_b', cutoffDate: '2026-07-03' })
    expect(closeNonTradingPending).toHaveBeenCalledTimes(1)
    expect(result.warningFailures).toBe(0)
    expect(result.gtAPending?.pendingCount).toBe(1)
    expect(result.gtAFinalized).toHaveLength(1)
    expect(result.gtAFinalized[0].finalCount).toBe(1)
    expect(result.gtBFinalized).toHaveLength(1)
    expect(result.gtBFinalized[0].coverageRate).toBe(1)
  })

  it('retroactively finalizes an older still-pending base_date that failed to finalize two days ago', async () => {
    const cutoffDate = getDailyLabelBaseDates('2026-07-10').finalizeCutoffDate // '2026-07-03'
    const staleBaseDate = '2026-07-01' // finalize attempt failed two runs ago and was never retried

    const generateGtA = vi.fn()
      .mockResolvedValueOnce({ ...emptyGtAResult, baseDate: '2026-07-10', pendingCount: 1 }) // pending step
      .mockResolvedValueOnce({ ...emptyGtAResult, baseDate: staleBaseDate }) // retroactive catch-up
      .mockResolvedValueOnce({ ...emptyGtAResult, baseDate: cutoffDate }) // current cutoff
    const generateGtB = vi.fn().mockResolvedValue(emptyGtBResult)
    const loadPendingBaseDates = vi.fn().mockImplementation(async ({ labelType }) =>
      labelType === 'gt_a' ? [staleBaseDate] : [])
    const closeNonTradingPending = vi.fn().mockResolvedValue(0)
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-10', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates,
      closeNonTradingPending,
      warn,
    })

    // pending step + 2 finalize calls (stale backlog date, then current cutoff), sorted ascending.
    expect(generateGtA).toHaveBeenCalledTimes(3)
    expect(generateGtA).toHaveBeenNthCalledWith(2, {
      baseDate: staleBaseDate,
      existingPendingOnly: true,
      includeInactive: true,
      today: '2026-07-10',
    })
    expect(generateGtA).toHaveBeenNthCalledWith(3, {
      baseDate: cutoffDate,
      includeInactive: true,
      missingOrPendingOnly: true,
      today: '2026-07-10',
    })
    expect(result.gtAFinalized.map((r) => r.baseDate)).toEqual([staleBaseDate, cutoffDate])
    expect(result.warningFailures).toBe(0)
  })

  it('downgrades label failures to warnings so the next run can catch up', async () => {
    const generateGtA = vi.fn()
      .mockRejectedValueOnce(new Error('pending table unavailable'))
      .mockRejectedValueOnce(new Error('finalize unavailable'))
    const generateGtB = vi.fn().mockRejectedValue(new Error('missing KOSPI'))
    const loadPendingBaseDates = vi.fn().mockResolvedValue([])
    const closeNonTradingPending = vi.fn().mockResolvedValue(0)
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-10', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates,
      closeNonTradingPending,
      warn,
    })

    expect(result.warningFailures).toBe(3)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('warns explicitly when an expired GT-B row remains pending for missing prices', async () => {
    const cutoffDate = getDailyLabelBaseDates('2026-07-10').finalizeCutoffDate
    const generateGtA = vi.fn().mockResolvedValue(emptyGtAResult)
    const generateGtB = vi.fn().mockResolvedValue({
      ...emptyGtBResult,
      baseDate: cutoffDate,
      finalCount: 0,
      pendingCount: 2,
      coverageRate: 0,
    })
    const loadPendingBaseDates = vi.fn().mockImplementation(async ({ labelType }) =>
      labelType === 'gt_b' ? [cutoffDate] : [])
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-10', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates,
      closeNonTradingPending: vi.fn().mockResolvedValue(0),
      warn,
    })

    expect(generateGtB).toHaveBeenCalledWith(cutoffDate, { missingOrPendingOnly: true })
    expect(result.warningFailures).toBe(1)
    expect(warn).toHaveBeenCalledWith(
      `GT-B 만기 라벨 가격 부족으로 pending 유지 (base_date=${cutoffDate}, count=2)`,
    )
  })

  it('runs every observed production backlog date without a per-run date cap', async () => {
    const gtABaseDate = '2026-07-03'
    const gtBBaseDates = ['2026-06-19', '2026-06-26', '2026-07-03']
    const generateGtA = vi.fn().mockResolvedValue(emptyGtAResult)
    const generateGtB = vi.fn().mockImplementation(async (baseDate: string) => ({
      ...emptyGtBResult,
      baseDate,
    }))

    await runDailyLabelPhase('2026-07-10', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates: vi.fn().mockImplementation(async ({ labelType }) =>
        labelType === 'gt_a' ? [gtABaseDate] : gtBBaseDates),
      closeNonTradingPending: vi.fn().mockResolvedValue(0),
      warn: vi.fn(),
    })

    expect(generateGtB.mock.calls).toEqual([
      ['2026-06-19', { existingPendingOnly: true }],
      ['2026-06-26', { existingPendingOnly: true }],
      ['2026-07-03', { missingOrPendingOnly: true }],
    ])
  })

  it('paginates past the 500-row scan limit to collect every pending base_date (F3)', async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({ base_date: `2026-01-${String(i)}` }))
    const secondPage = Array.from({ length: 10 }, (_, i) => ({ base_date: `2026-02-${String(i)}` }))
    supabaseAdminMocks.pages.push({ data: firstPage, error: null }, { data: secondPage, error: null })

    const result = await loadPendingBaseDates({ labelType: 'gt_a', cutoffDate: '2026-12-31' })

    expect(result).toHaveLength(510)
    expect(supabaseAdminMocks.order).toHaveBeenCalledWith('base_date', { ascending: true })
    expect(supabaseAdminMocks.order).toHaveBeenCalledWith('id', { ascending: true })
  })

  it('scopes each backlog scan to its legacy labeler version after the identity key became versioned', async () => {
    supabaseAdminMocks.pages.push({ data: [], error: null }, { data: [], error: null })

    await loadPendingBaseDates({ labelType: 'gt_a', cutoffDate: '2026-07-03' })
    expect(supabaseAdminMocks.eq).toHaveBeenCalledWith('labeler_version', 'gta-v1')
    expect(supabaseAdminMocks.eq).toHaveBeenCalledWith('horizon_days', 5)

    supabaseAdminMocks.eq.mockClear()
    await loadPendingBaseDates({ labelType: 'gt_b', cutoffDate: '2026-07-03' })
    expect(supabaseAdminMocks.eq).toHaveBeenCalledWith('labeler_version', 'gtb-v1')
    expect(supabaseAdminMocks.eq).toHaveBeenCalledWith('horizon_days', 5)
  })

  it('keeps the fail-loud expired count global unless a diagnostic version is requested', async () => {
    await countExpiredPendingLabels({ labelType: 'gt_a', cutoffDate: '2026-07-03' })
    expect(supabaseAdminMocks.eq).not.toHaveBeenCalledWith('labeler_version', expect.anything())

    supabaseAdminMocks.eq.mockClear()
    await countExpiredPendingLabels({
      labelType: 'gt_a',
      cutoffDate: '2026-07-03',
      labelerVersion: 'gta-v2',
    })
    expect(supabaseAdminMocks.eq).toHaveBeenCalledWith('labeler_version', 'gta-v2')
  })
})
