import { describe, expect, it } from 'vitest'
import { planMonthlyCalibration } from '@/scripts/tli/scoring/monthly-calibration-schedule'

describe('monthly calibration schedule policy', () => {
  it('defers when month first day is not an eligible full run', () => {
    expect(planMonthlyCalibration({
      kstDate: '2026-08-01',
      eligibleRun: false,
      runDates: [],
    })).toBe('deferred')
  })

  it('executes on the first eligible monthly run when no run exists', () => {
    expect(planMonthlyCalibration({
      kstDate: '2026-08-03',
      eligibleRun: true,
      runDates: [],
    })).toBe('executed')
  })

  it('skips later eligible runs after the month has a run marker', () => {
    expect(planMonthlyCalibration({
      kstDate: '2026-08-04',
      eligibleRun: true,
      runDates: ['2026-08-03'],
    })).toBe('skipped')
  })
})
