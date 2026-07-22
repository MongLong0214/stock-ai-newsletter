import { describe, expect, it } from 'vitest'

import { deriveGtAV2Windows } from '../labels/gta-v2-daily'

// 2026-07 KOSPI 실측: 7/17(제헌절 재지정)·주말 휴장이 반영된 거래일 시퀀스.
const KOSPI_DATES = [
  '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
  '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24',
  '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
]

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
