import { describe, expect, it, vi } from 'vitest'

vi.mock('@/scripts/tli/shared/supabase-admin', () => ({
  supabaseAdmin: {},
}))

import {
  getDailyLabelBaseDates,
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

describe('daily label phase non-trading maturity', () => {
  it('anchors a Sunday finalization cutoff to the latest completed trading day', () => {
    expect(getDailyLabelBaseDates('2026-07-12')).toEqual({
      pendingBaseDate: '2026-07-12',
      finalizeCutoffDate: '2026-07-03',
    })
  })

  it('advances the deferred Sunday candidate on the next trading day', () => {
    expect(getDailyLabelBaseDates('2026-07-13')).toEqual({
      pendingBaseDate: '2026-07-13',
      finalizeCutoffDate: '2026-07-06',
    })
  })

  it('anchors a weekday market holiday to the preceding completed trading day', () => {
    expect(getDailyLabelBaseDates('2026-01-01')).toEqual({
      pendingBaseDate: '2026-01-01',
      finalizeCutoffDate: '2025-12-22',
    })
  })

  it('retries the latest mature cutoff on Sunday without rewriting terminal identities', async () => {
    const generateGtA = vi.fn().mockResolvedValue(emptyGtAResult)
    const generateGtB = vi.fn().mockResolvedValue(emptyGtBResult)
    const loadPendingBaseDates = vi.fn().mockResolvedValue([])
    const closeNonTradingPending = vi.fn().mockResolvedValue(3)
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-05', {
      generateGtA,
      generateGtB,
      loadPendingBaseDates,
      closeNonTradingPending,
      warn,
    })

    expect(generateGtA).toHaveBeenCalledWith({
      baseDate: '2026-06-26',
      includeInactive: true,
      missingOrPendingOnly: true,
      today: '2026-07-05',
    })
    expect(generateGtB).toHaveBeenCalledWith('2026-06-26', { missingOrPendingOnly: true })
    expect(loadPendingBaseDates).toHaveBeenCalledWith({
      labelType: 'gt_a',
      cutoffDate: '2026-06-26',
    })
    expect(result.gtAPending).toBeNull()
    expect(closeNonTradingPending).toHaveBeenCalledTimes(1)
    expect(result.nonTradingPendingClosed).toBe(3)
    expect(result.warningFailures).toBe(0)
  })

  it('treats an already-terminal Sunday cutoff as an idempotent no-op', async () => {
    const zeroGtA = {
      ...emptyGtAResult,
      totalThemes: 0,
      finalCount: 0,
    }
    const zeroGtB = {
      ...emptyGtBResult,
      totalThemes: 0,
      finalCount: 0,
    }

    const result = await runDailyLabelPhase('2026-07-12', {
      generateGtA: vi.fn().mockResolvedValue(zeroGtA),
      generateGtB: vi.fn().mockResolvedValue(zeroGtB),
      loadPendingBaseDates: vi.fn().mockResolvedValue([]),
      closeNonTradingPending: vi.fn().mockResolvedValue(0),
      warn: vi.fn(),
    })

    expect(result.gtAFinalized).toEqual([])
    expect(result.gtBFinalized).toEqual([])
    expect(result.warningFailures).toBe(0)
  })

  it('warns when a mature GT-A backlog date resolves to zero terminal rows', async () => {
    const baseDate = '2026-07-03'
    const generateGtA = vi.fn().mockResolvedValue({
      ...emptyGtAResult,
      baseDate,
      totalThemes: 0,
      finalCount: 0,
    })
    const warn = vi.fn()

    const result = await runDailyLabelPhase('2026-07-12', {
      generateGtA,
      generateGtB: vi.fn().mockResolvedValue(emptyGtBResult),
      loadPendingBaseDates: vi.fn().mockImplementation(async ({ labelType }) =>
        labelType === 'gt_a' ? [baseDate] : []),
      closeNonTradingPending: vi.fn().mockResolvedValue(0),
      warn,
    })

    expect(generateGtA).toHaveBeenCalledWith({
      baseDate,
      includeInactive: true,
      missingOrPendingOnly: true,
      today: '2026-07-12',
    })
    expect(result.gtAFinalized).toEqual([])
    expect(result.warningFailures).toBe(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(
      `GT-A 만기 대상 확정 결과가 0건입니다 (base_date=${baseDate})`,
    ))
  })

  it('recovers a failed Friday cutoff on Sunday and advances it on Monday', async () => {
    const generateGtA = vi.fn(async (input: { baseDate: string; today?: string }) => {
      if (input.baseDate === '2026-07-03' && input.today === '2026-07-10') {
        throw new Error('temporary Friday failure')
      }
      return { ...emptyGtAResult, baseDate: input.baseDate }
    })
    const generateGtB = vi.fn(async (baseDate: string) => ({
      ...emptyGtBResult,
      baseDate,
    }))
    const deps = {
      generateGtA,
      generateGtB,
      loadPendingBaseDates: vi.fn().mockResolvedValue([]),
      closeNonTradingPending: vi.fn().mockResolvedValue(0),
      warn: vi.fn(),
    }

    const friday = await runDailyLabelPhase('2026-07-10', deps)
    const sunday = await runDailyLabelPhase('2026-07-12', deps)
    const monday = await runDailyLabelPhase('2026-07-13', deps)

    expect(friday.warningFailures).toBe(1)
    expect(sunday.gtAFinalized.map((result) => result.baseDate)).toEqual(['2026-07-03'])
    expect(monday.gtAFinalized.map((result) => result.baseDate)).toEqual(['2026-07-06'])
    expect(generateGtA.mock.calls
      .map(([input]) => input)
      .filter((input) => 'missingOrPendingOnly' in input))
      .toEqual([
        { baseDate: '2026-07-03', includeInactive: true, missingOrPendingOnly: true, today: '2026-07-10' },
        { baseDate: '2026-07-03', includeInactive: true, missingOrPendingOnly: true, today: '2026-07-12' },
        { baseDate: '2026-07-06', includeInactive: true, missingOrPendingOnly: true, today: '2026-07-13' },
      ])
    expect(generateGtB.mock.calls).toEqual([
      ['2026-07-03', { missingOrPendingOnly: true }],
      ['2026-07-03', { missingOrPendingOnly: true }],
      ['2026-07-06', { missingOrPendingOnly: true }],
    ])
  })
})
